sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/BusyDialog",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (
    MessageToast,
    MessageBox,
    BusyDialog,
    Filter,
    FilterOperator,
    ChangeStore
) {
    "use strict";

    var bSaving = false;
    var sGroupId = "if007Save";

    var oBusyDialog = new BusyDialog({
        title: "正在保存",
        text: "正在保存选中的数据，请稍候...",
        showCancelButton: false
    });

    function makeKey(sOrder, sItem) {
        return JSON.stringify([sOrder, sItem]);
    }

    function preparePayload(oRow) {
        var oPayload = {
            SalesOrder: oRow.SalesOrder,
            SalesOrderItem: oRow.SalesOrderItem
        };

        ["FollowUpDate", "CommentText", "SapStatus"].forEach(
            function (sField) {
                if (Object.prototype.hasOwnProperty.call(
                    oRow, sField
                )) {
                    var vValue = oRow[sField];

                    if (sField === "FollowUpDate" &&
                        vValue === "") {
                        vValue = null;
                    }

                    oPayload[sField] = vValue;
                }
            }
        );

        return oPayload;
    }

    function validate(oRow) {
        if (oRow.CommentText != null &&
            oRow.CommentText.length > 255) {
            throw new Error("备注不能超过255个字符");
        }

        if (oRow.FollowUpDate &&
            !/^\d{4}-\d{2}-\d{2}$/.test(oRow.FollowUpDate)) {
            throw new Error("跟进日期格式不正确");
        }

        if (oRow.SapStatus &&
            !["OPEN", "PROC", "DONE"].includes(oRow.SapStatus)) {
            throw new Error("SAP状态不正确");
        }
    }

    return {
        isEnabled: function (oContext, aSelectedContexts) {
            return Array.isArray(aSelectedContexts) &&
                aSelectedContexts.length > 0;
        },

        onSaveChanges: async function (
            oContext,
            aSelectedContexts
        ) {
            if (bSaving) {
                return;
            }

            if (!aSelectedContexts ||
                aSelectedContexts.length === 0) {
                return;
            }

            // 1. 收集选中行的复合Key
            var oSelectedKeys = new Set();

            aSelectedContexts.forEach(function (oSelected) {
                oSelectedKeys.add(makeKey(
                    oSelected.getProperty("SalesOrder"),
                    oSelected.getProperty("SalesOrderItem")
                ));
            });

            // 2. 只保留已选中且修改过的记录
            var aChanges = ChangeStore.getChanges().filter(
                function (oRow) {
                    return oSelectedKeys.has(makeKey(
                        oRow.SalesOrder,
                        oRow.SalesOrderItem
                    ));
                }
            );

            if (aChanges.length === 0) {
                MessageToast.show("选中的数据没有修改内容");
                return;
            }

            var oModel = ChangeStore.getAddonModel();

            if (!oModel) {
                MessageBox.error(
                    "找不到 addon OData Model，请检查 manifest.json"
                );
                return;
            }


            bSaving = true;
            oBusyDialog.open();


            try {
                var aPlans = [];

                // 3. 检查ZRAP_IF007是否已有对应记录
                for (var oRow of aChanges) {
                    validate(oRow);

                    var oFilter = new Filter({
                        filters: [
                            new Filter(
                                "SalesOrder",
                                FilterOperator.EQ,
                                oRow.SalesOrder
                            ),
                            new Filter(
                                "SalesOrderItem",
                                FilterOperator.EQ,
                                oRow.SalesOrderItem
                            )
                        ],
                        and: true
                    });

                    var oReadBinding = oModel.bindList(
                        "/Addon",
                        undefined,
                        undefined,
                        [oFilter]
                    );

                    var aExisting =
                        await oReadBinding.requestContexts(0, 1);

                    aPlans.push({
                        row: oRow,
                        payload: preparePayload(oRow),
                        context: aExisting.length
                            ? aExisting[0]
                            : null,
                        binding: oReadBinding
                    });
                }

                // 4. 准备批量新增和修改
                var oCreateBinding = oModel.bindList(
                    "/Addon",
                    undefined,
                    undefined,
                    undefined,
                    {
                        "$$updateGroupId": sGroupId
                    }
                );

                var aJobs = [];

                aPlans.forEach(function (oPlan) {
                    var oPayload = oPlan.payload;

                    if (!oPlan.context) {
                        // 不存在：CREATE
                        var oCreated = oCreateBinding.create(
                            oPayload,
                            true
                        );

                        aJobs.push({
                            row: oPlan.row,
                            created: oCreated,
                            type: "CREATE"
                        });

                    } else {
                        // 已存在：UPDATE
                        var aPromises = [];

                        ["FollowUpDate", "CommentText", "SapStatus"]
                            .forEach(function (sField) {
                                if (
                                    Object.prototype.hasOwnProperty.call(
                                        oPayload, sField
                                    )
                                ) {
                                    var p = oPlan.context.setProperty(
                                        sField,
                                        oPayload[sField],
                                        sGroupId
                                    );

                                    aPromises.push(
                                        p.then(
                                            function () { return true; },
                                            function () { return false; }
                                        )
                                    );
                                }
                            });

                        aJobs.push({
                            row: oPlan.row,
                            promises: aPromises,
                            type: "UPDATE"
                        });
                    }
                });

                // 5. 一次提交写入请求
                await oModel.submitBatch(sGroupId);

                // 6. 逐条确认结果
                var aSuccessful = [];

                for (var oJob of aJobs) {
                    var bSuccess = false;

                    if (oJob.type === "CREATE") {
                        // 创建成功后不再是临时Context
                        bSuccess = !oJob.created.isTransient();
                    } else {
                        var aResults =
                            await Promise.all(oJob.promises);

                        bSuccess = aResults.every(Boolean);
                    }

                    if (bSuccess) {
                        aSuccessful.push(oJob.row);
                    }
                }

                // 7. 只清理保存成功的数据
                ChangeStore.confirmSaved(aSuccessful);

                var iFailed =
                    aChanges.length - aSuccessful.length;

                if (iFailed === 0) {
                    MessageToast.show(
                        "保存成功：" +
                        aSuccessful.length + " 条"
                    );
                } else {
                    MessageBox.warning(
                        "保存成功：" + aSuccessful.length +
                        " 条；失败：" + iFailed +
                        " 条。失败记录仍保留在修改缓存中。"
                    );
                }

                // 清理本次提交中未成功的OData待处理变更
                if (oModel.hasPendingChanges(sGroupId)) {
                    oModel.resetChanges(sGroupId);
                }

            } catch (oError) {
                if (oModel.hasPendingChanges(sGroupId)) {
                    oModel.resetChanges(sGroupId);
                }

                MessageBox.error(
                    "保存失败：" +
                    (oError.message || String(oError))
                );
                console.error("[IF007] Save error", oError);

            } finally {
                oBusyDialog.close();
                bSaving = false;
            }
        }
    };
});