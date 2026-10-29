sap.ui.define([
    "sap/ui/model/json/JSONModel"
], function (JSONModel) {
    "use strict";

    var mChanges = Object.create(null);
    var mSavedDisplay = Object.create(null);
    var mPendingByKey = Object.create(null);
    var oAddonModel = null;
    var oSyncModel = null;
    var bBusy = false;

    var oStateModel = new JSONModel({ revision: 0, busy: false });

    function makeKey(sOrder, sItem) {
        return JSON.stringify([sOrder, sItem]);
    }

    function copyRow(oRow) {
        return Object.assign({}, oRow);
    }

    function notifyChange() {
        oStateModel.setProperty(
            "/revision",
            oStateModel.getProperty("/revision") + 1
        );
    }

    function getPending(sOrder, sItem) {
        return mPendingByKey[makeKey(sOrder, sItem)] || null;
    }

    // A: 正常/两边失败; S: 仅 SAP 重试; C: 仅 Cloud 重试
    function getRowMode(sOrder, sItem) {
        var oPending = getPending(sOrder, sItem);
        if (!oPending) {
            return "A";
        }
        if (oPending.sapStatus === "F" &&
            oPending.cloudStatus === "F") {
            return "A";
        }
        if (oPending.sapStatus === "F" &&
            oPending.cloudStatus === "S") {
            return "S";
        }
        if (oPending.sapStatus === "S" &&
            oPending.cloudStatus === "F") {
            return "C";
        }
        return null;
    }

    function getSelectionMode(aContexts) {
        if (!Array.isArray(aContexts) || !aContexts.length || bBusy) {
            return null;
        }
        var sMode = null;
        for (var oContext of aContexts) {
            var sOrder = oContext.getProperty("SalesOrder");
            var sItem = oContext.getProperty("SalesOrderItem");
            var sCurrent = getRowMode(sOrder, sItem);
            if (!sCurrent || (sMode && sMode !== sCurrent)) {
                return null;
            }
            sMode = sCurrent;
        }
        return sMode;
    }

    return {
        getModel: function () {
            return oStateModel;
        },

        setAddonModel: function (oModel) {
            oAddonModel = oModel;
        },

        getAddonModel: function () {
            return oAddonModel;
        },

        setSyncModel: function (oModel) {
            oSyncModel = oModel;
        },

        getSyncModel: function () {
            return oSyncModel;
        },

        isRowEditable: function (sOrder, sItem) {
            return !bBusy && !getPending(sOrder, sItem);
        },

        setValue: function (oContext, sField, vValue) {
            if (!oContext) {
                return false;
            }
            var sOrder = oContext.getProperty("SalesOrder");
            var sItem = oContext.getProperty("SalesOrderItem");
            if (sOrder == null || sItem == null ||
                !this.isRowEditable(sOrder, sItem)) {
                return false;
            }
            var sKey = makeKey(sOrder, sItem);
            if (!mChanges[sKey]) {
                mChanges[sKey] = {
                    SalesOrder: sOrder,
                    SalesOrderItem: sItem
                };
            }
            mChanges[sKey][sField] = vValue;
            return true;
        },

        getValue: function (sOrder, sItem, vOriginal, sField) {
            var sKey = makeKey(sOrder, sItem);
            var oRow = mChanges[sKey];
            if (oRow && Object.prototype.hasOwnProperty.call(oRow, sField)) {
                return oRow[sField];
            }
            oRow = mSavedDisplay[sKey];
            if (oRow && Object.prototype.hasOwnProperty.call(oRow, sField)) {
                return oRow[sField];
            }
            return vOriginal == null ? "" : vOriginal;
        },

        getChanges: function () {
            return Object.keys(mChanges).map(function (sKey) {
                return copyRow(mChanges[sKey]);
            });
        },

        getModeForSelection: getSelectionMode,

        getPendingRow: function (sOrder, sItem) {
            var oPending = getPending(sOrder, sItem);
            return oPending ? copyRow(oPending.row) : null;
        },

        // 只为本次选中的 Key 建立/保留快照
        beginRows: function (aRows) {
            aRows.forEach(function (oRow) {
                var sKey = makeKey(oRow.SalesOrder, oRow.SalesOrderItem);
                var oPending = mPendingByKey[sKey];
                if (!oPending) {
                    mPendingByKey[sKey] = {
                        row: copyRow(oRow),
                        sapStatus: "N",
                        cloudStatus: "N",
                        sapMessage: "",
                        cloudMessage: ""
                    };
                } else if (oPending.sapStatus !== "F" ||
                    oPending.cloudStatus !== "F") {
                    // 单边重试允许继续使用快照，禁止用新输入覆盖
                    // 此处不改已有记录
                }
            });
            notifyChange();
        },

        // HTTP 完成后更新本次选中的订单，不影响其他订单
        setSideResults: function (aRows, sSide, sStatus, sMessage) {
            if ((sSide !== "sap" && sSide !== "cloud") ||
                (sStatus !== "S" && sStatus !== "F")) {
                throw new Error("Invalid save result");
            }
            aRows.forEach(function (oRow) {
                var oPending = getPending(oRow.SalesOrder, oRow.SalesOrderItem);
                if (!oPending) {
                    throw new Error("Pending row not found");
                }
                oPending[sSide + "Status"] = sStatus;
                oPending[sSide + "Message"] = sMessage || "";
            });
            notifyChange();
        },

        // 两边都成功的订单单独结束，其他失败订单继续保留
        finishRows: function (aRows) {
            var iCompleted = 0;
            aRows.forEach(function (oRow) {
                var sKey = makeKey(oRow.SalesOrder, oRow.SalesOrderItem);
                var oPending = mPendingByKey[sKey];
                if (!oPending || oPending.sapStatus !== "S" ||
                    oPending.cloudStatus !== "S") {
                    return;
                }
                mSavedDisplay[sKey] = Object.assign(
                    {}, mSavedDisplay[sKey] || {}, oPending.row
                );
                delete mChanges[sKey];
                delete mPendingByKey[sKey];
                iCompleted++;
            });
            notifyChange();
            return iCompleted;
        },

        getBatchSummary: function (aRows) {
            var aResults = aRows.map(function (oRow) {
                var oPending = getPending(oRow.SalesOrder, oRow.SalesOrderItem);
                return {
                    key: makeKey(oRow.SalesOrder, oRow.SalesOrderItem),
                    sapStatus: oPending ? oPending.sapStatus : "S",
                    cloudStatus: oPending ? oPending.cloudStatus : "S",
                    sapMessage: oPending ? oPending.sapMessage : "",
                    cloudMessage: oPending ? oPending.cloudMessage : ""
                };
            });
            return aResults;
        },

        setBusy: function (bValue) {
            bBusy = !!bValue;
            oStateModel.setProperty("/busy", bBusy);
            notifyChange();
        },

        // 兼容旧接口，其他调用方无需立即改动
        confirmSaved: function (aRows) {
            aRows.forEach(function (oRow) {
                var sKey = makeKey(oRow.SalesOrder, oRow.SalesOrderItem);
                mSavedDisplay[sKey] = Object.assign(
                    {}, mSavedDisplay[sKey] || {}, mChanges[sKey] || {}, oRow
                );
                delete mChanges[sKey];
            });
            notifyChange();
        },

        // 查询刷新不能丢失未完成的失败重试记录
        clear: function () {
            if (bBusy || Object.keys(mPendingByKey).length > 0) {
                return false;
            }
            mChanges = Object.create(null);
            mSavedDisplay = Object.create(null);
            notifyChange();
            return true;
        }
    };
});
