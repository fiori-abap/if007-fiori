sap.ui.define([
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (ChangeStore) {
    "use strict";

    function getModel() {
        var oModel = ChangeStore.getSyncModel();

        if (!oModel) {
            throw new Error("IF007 Sync Model 未初始化");
        }

        return oModel;
    }

    // SAP 订单号、明细号统一为内部 Key
    function normalizeKey(vValue, iLength) {
        var sValue = String(
            vValue == null ? "" : vValue
        ).trim();

        if (/^\d+$/.test(sValue) &&
            sValue.length <= iLength) {
            return sValue.padStart(iLength, "0");
        }

        return sValue;
    }

    // OData 返回的明细号可能是 "10"
    function toODataItem(vItem) {
        var sItem = normalizeKey(vItem, 6);

        return /^\d+$/.test(sItem)
            ? String(Number(sItem))
            : sItem;
    }

    async function readSnapshot(sOrder, sItem) {
        var oModel = getModel();
        var sOrderKey = normalizeKey(sOrder, 10);
        var sItemKey = normalizeKey(sItem, 6);

        var sFilter = "SalesOrder eq '" +
            sOrderKey.replace(/'/g, "''") + "'";

        var oBinding = oModel.bindList(
            "/Sync",
            undefined,
            undefined,
            undefined,
            {
                $filter: sFilter,
                $$groupId: "$direct"
            }
        );

        try {
            // 分页读取，按完整复合 Key 匹配
            for (var iOffset = 0; iOffset < 10000; iOffset += 100) {
                var aContexts =
                    await oBinding.requestContexts(iOffset, 100);

                for (var oContext of aContexts) {
                    var sCurrentOrder = normalizeKey(
                        oContext.getProperty("SalesOrder"), 10
                    );

                    var sCurrentItem = normalizeKey(
                        oContext.getProperty("SalesOrderItem"), 6
                    );

                    if (sCurrentOrder === sOrderKey &&
                        sCurrentItem === sItemKey) {

                        return await oContext.requestObject();
                    }
                }

                if (aContexts.length < 100) {
                    return null;
                }
            }

            throw new Error("同步记录超过查询范围");
        } finally {
            oBinding.destroy();
        }
    }

    async function createSnapshot(oRow) {
        var oModel = getModel();

        var sOrder = normalizeKey(oRow.SalesOrder, 10);
        var sItem = normalizeKey(oRow.SalesOrderItem, 6);

        if (!sOrder || !sItem ||
            !oRow.RequestId ||
            !/^[01]{5}$/.test(oRow.ChangeMask || "")) {
            throw new Error("同步快照参数不完整");
        }

        var oExisting = await readSnapshot(sOrder, sItem);

        if (oExisting) {
            throw new Error(
                "同步记录已存在，需要执行 UPDATE"
            );
        }

        var oPayload = {
            SalesOrder: sOrder,
            SalesOrderItem: toODataItem(sItem),

            RequestId: oRow.RequestId,

            SapSaveState: oRow.SapSaveState || "P",
            CloudSaveState: oRow.CloudSaveState || "P",

            PendingComment: oRow.PendingComment ?? "",
            PendingFollowUpDate: oRow.PendingFollowUpDate ?? null,
            PendingSapStatus: oRow.PendingSapStatus ?? "",
            PendingDeliveryDate: oRow.PendingDeliveryDate ?? null,
            PendingExternalStatus: oRow.PendingExternalStatus ?? "",

            ChangeMask: oRow.ChangeMask,

            SapError: "",
            CloudError: ""
        };

        var oBinding = oModel.bindList(
            "/Sync",
            undefined,
            undefined,
            undefined,
            {
                $$groupId: "$direct",
                $$updateGroupId: "$direct"
            }
        );

        try {
            // CREATE 失败时不能只等待 created()
            var pCompleted = new Promise(function (resolve, reject) {
                oBinding.attachCreateCompleted(function (oEvent) {
                    if (oEvent.getParameter("success")) {
                        resolve();
                    } else {
                        reject(new Error("Sync CREATE 请求失败"));
                    }
                });
            });

            var oContext = oBinding.create(oPayload, true);

            await pCompleted;
            await oContext.created();

            return await readSnapshot(sOrder, sItem);

        } finally {
            oBinding.destroy();
        }
    }

    return {
        readSnapshot: readSnapshot,
        createSnapshot: createSnapshot
    };
});