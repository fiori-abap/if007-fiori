sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/BusyDialog",
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (MessageToast, MessageBox, BusyDialog, ChangeStore) {
    "use strict";

    var bSaving = false;
    var sActionPath =
        "/Addon/com.sap.gateway.srvd.zui_if007_addon.v0001.saveBatch(...)";

    var oBusyDialog = new BusyDialog({
        title: "正在保存",
        text: "正在处理 SAP 和 HANA Cloud 数据，请稍候...",
        showCancelButton: false
    });

    function makeKey(sOrder, sItem) {
        return JSON.stringify([sOrder, sItem]);
    }

    function normalizeSapKey(vValue, iLength) {
        var sValue = String(
            vValue == null ? "" : vValue
        ).trim();

        if (/^\d+$/.test(sValue) &&
            sValue.length <= iLength) {
            return sValue.padStart(iLength, "0");
        }

        return sValue;
    }


    function normalizeValue(vValue) {
        return vValue == null ? "" : vValue;
    }

    function collectRows(aSelectedContexts, sMode) {
        var mChanges = Object.create(null);
        ChangeStore.getChanges().forEach(function (oRow) {
            mChanges[makeKey(oRow.SalesOrder, oRow.SalesOrderItem)] = oRow;
        });

        var aRows = [];
        aSelectedContexts.forEach(function (oContext) {
            var sOrder = oContext.getProperty("SalesOrder");
            var sItem = oContext.getProperty("SalesOrderItem");
            var oPendingRow = ChangeStore.getPendingRow(sOrder, sItem);

            if (oPendingRow) {
                aRows.push(oPendingRow);
                return;
            }

            // 普通保存只发送已改动的订单，不重写未改动行
            if (sMode === "A" && !mChanges[makeKey(sOrder, sItem)]) {
                return;
            }

            aRows.push({
                SalesOrder: sOrder,
                SalesOrderItem: sItem,
                FollowUpDate: normalizeValue(ChangeStore.getValue(
                    sOrder, sItem, oContext.getProperty("FollowUpDate"), "FollowUpDate"
                )),
                CommentText: normalizeValue(ChangeStore.getValue(
                    sOrder, sItem, oContext.getProperty("CommentText"), "CommentText"
                )),
                SapStatus: normalizeValue(ChangeStore.getValue(
                    sOrder, sItem, oContext.getProperty("SapStatus"), "SapStatus"
                ))
            });
        });
        return aRows;
    }

    function validateRows(aRows) {
        aRows.forEach(function (oRow) {
            if (!oRow.SalesOrder || !oRow.SalesOrderItem) {
                throw new Error("订单编号或明细编号为空");
            }
            if (String(oRow.CommentText || "").length > 255) {
                throw new Error(oRow.SalesOrder + "：备注不能超过255个字符");
            }
            if (oRow.FollowUpDate &&
                !/^\d{4}-\d{2}-\d{2}$/.test(oRow.FollowUpDate)) {
                throw new Error(oRow.SalesOrder + "：日期格式不正确");
            }
            if (oRow.SapStatus &&
                !["OPEN", "PROC", "DONE"].includes(oRow.SapStatus)) {
                throw new Error(oRow.SalesOrder + "：SAP状态不正确");
            }
        });
    }

    function buildJson(aRows) {
        return JSON.stringify({
            rows: aRows.map(function (oRow) {
                return {
                    orderNo: normalizeSapKey(
                        oRow.SalesOrder, 10
                    ),
                    itemNo: normalizeSapKey(
                        oRow.SalesOrderItem, 6
                    ),
                    followUpDate: oRow.FollowUpDate,
                    commentText: oRow.CommentText,
                    sapStatus: oRow.SapStatus
                };
            })
        });
    }

    async function callAction(sMode, aRows) {
        var oModel = ChangeStore.getAddonModel();
        if (!oModel) {
            throw new Error("找不到 Addon OData Model");
        }
        var oAction = oModel.bindContext(sActionPath);
        oAction.setParameter("SaveMode", sMode);
        oAction.setParameter("RowsJson", buildJson(aRows));

        // 不使用原来 SAP CRUD 的 pending batch，以独立请求确认提交结果
        await oAction.invoke("$direct");

        var oContext = oAction.getBoundContext();
        if (!oContext) {
            throw new Error("Action 没有返回结果");
        }
        var oResult = oContext.getObject();
        if (oResult && Array.isArray(oResult.value)) {
            oResult = oResult.value[0];
        }
        if (!oResult) {
            throw new Error("Action 返回为空");
        }
        return oResult;
    }

    async function executeSide(sSide, aRows) {
        try {
            var oResult = await callAction(sSide === "sap" ? "S" : "C", aRows);
            var sStatus = sSide === "sap" ? oResult.SapStatus : oResult.CloudStatus;
            var sMessage = sSide === "sap" ? oResult.SapMessage : oResult.CloudMessage;

            // P 只有批次统计，无法确认具体失败订单：整体按失败保留重试
            if (sStatus !== "S") {
                return { status: "F", message: sMessage || "本批次未全部成功" };
            }
            return { status: "S", message: sMessage || "保存成功" };
        } catch (oError) {
            return { status: "F", message: oError.message || String(oError) };
        }
    }

    function resultMessage(oResult, sSide) {
        var sLabel = sSide === "sap" ? "SAP" : "Cloud";
        var sStatus = sSide === "sap" ? oResult.sapStatus : oResult.cloudStatus;
        var sMessage = sSide === "sap" ? oResult.sapMessage : oResult.cloudMessage;
        return sLabel + "：" + (sStatus === "S" ? "保存成功" : "保存失败") +
            (sStatus === "S" ? "" : "\n" + (sMessage || ""));
    }

    async function save(sMode, aSelectedContexts) {
        if (bSaving) {
            return;
        }
        if (!Array.isArray(aSelectedContexts) || !aSelectedContexts.length) {
            MessageToast.show("请先勾选订单");
            return;
        }
        var sSelectedMode = ChangeStore.getModeForSelection(aSelectedContexts);
        if (sSelectedMode !== sMode) {
            MessageBox.warning(
                "当前所选订单的保存状态不同，请分别勾选正常订单或同一种失败订单。"
            );
            return;
        }

        var aRows = collectRows(aSelectedContexts, sMode);
        if (!aRows.length) {
            MessageToast.show("选中的订单没有修改内容");
            return;
        }
        try {
            validateRows(aRows);
        } catch (oError) {
            MessageBox.error(oError.message);
            return;
        }

        ChangeStore.beginRows(aRows);
        bSaving = true;
        ChangeStore.setBusy(true);
        oBusyDialog.open();

        try {
            var aSides = sMode === "A" ? ["sap", "cloud"] :
                [sMode === "S" ? "sap" : "cloud"];

            var aSideResults = await Promise.all(aSides.map(function (sSide) {
                return executeSide(sSide, aRows);
            }));

            aSides.forEach(function (sSide, i) {
                var oSideResult = aSideResults[i];
                ChangeStore.setSideResults(
                    aRows, sSide, oSideResult.status, oSideResult.message
                );
            });

            var aSummaries = ChangeStore.getBatchSummary(aRows);
            var iCompleted = ChangeStore.finishRows(aRows);

            if (iCompleted === aRows.length) {
                MessageToast.show("SAP 和 Cloud 保存成功：" + iCompleted + " 条");
                return;
            }

            var oFirst = aSummaries[0];
            var bUniform = aSummaries.every(function (oRow) {
                return oRow.sapStatus === oFirst.sapStatus &&
                    oRow.cloudStatus === oFirst.cloudStatus;
            });

            var sMessage = bUniform
                ? resultMessage(oFirst, "sap") + "\n\n" + resultMessage(oFirst, "cloud")
                : "本次含不同保存结果，请分别选中相关订单处理。";

            if (bUniform) {
                if (oFirst.sapStatus === "S" && oFirst.cloudStatus === "F") {
                    sMessage += "\n\n请勾选失败订单，点击【仅保存 Cloud】重试。";
                } else if (oFirst.sapStatus === "F" && oFirst.cloudStatus === "S") {
                    sMessage += "\n\n请勾选失败订单，点击【仅保存 SAP】重试。";
                } else {
                    sMessage += "\n\n两边都失败，可勾选原订单再次点击【保存】。";
                }
            }
            MessageBox.warning(sMessage, { title: "IF007 保存结果" });
        } catch (oError) {
            MessageBox.error("保存过程发生错误：" + (oError.message || String(oError)));
            console.error("[IF007] Save error", oError);
        } finally {
            oBusyDialog.close();
            ChangeStore.setBusy(false);
            bSaving = false;
        }
    }

    return {
        // SAP FE 自动把当前勾选的 aSelectedContexts 传入 enablement 回调
        isEnabled: function (oContext, aSelectedContexts) {
            return !bSaving &&
                ChangeStore.getModeForSelection(aSelectedContexts) === "A";
        },
        isSapRetryEnabled: function (oContext, aSelectedContexts) {
            return !bSaving &&
                ChangeStore.getModeForSelection(aSelectedContexts) === "S";
        },
        isCloudRetryEnabled: function (oContext, aSelectedContexts) {
            return !bSaving &&
                ChangeStore.getModeForSelection(aSelectedContexts) === "C";
        },
        onSaveChanges: function (oContext, aSelectedContexts) {
            return save("A", aSelectedContexts);
        },
        onSaveSap: function (oContext, aSelectedContexts) {
            return save("S", aSelectedContexts);
        },
        onSaveCloud: function (oContext, aSelectedContexts) {
            return save("C", aSelectedContexts);
        }
    };
});
