sap.ui.define([
    "sap/ui/model/json/JSONModel"
], function (JSONModel) {
    "use strict";

    var mChanges = Object.create(null);
    var mSavedDisplay = Object.create(null);
    var oAddonModel = null;

    var oStateModel = new JSONModel({
        revision: 0
    });

    function makeKey(sOrder, sItem) {
        return JSON.stringify([sOrder, sItem]);
    }

    function notifyChange() {
        oStateModel.setProperty(
            "/revision",
            oStateModel.getProperty("/revision") + 1
        );
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

        setValue: function (oContext, sField, vValue) {
            if (!oContext) {
                return;
            }

            var sOrder = oContext.getProperty("SalesOrder");
            var sItem = oContext.getProperty("SalesOrderItem");

            if (sOrder == null || sItem == null) {
                return;
            }

            var sKey = makeKey(sOrder, sItem);

            if (!mChanges[sKey]) {
                mChanges[sKey] = {
                    SalesOrder: sOrder,
                    SalesOrderItem: sItem
                };
            }

            mChanges[sKey][sField] = vValue;
        },

        getValue: function (sOrder, sItem, vOriginal, sField) {
            var sKey = makeKey(sOrder, sItem);
            var oRow = mChanges[sKey];

            if (oRow &&
                Object.prototype.hasOwnProperty.call(oRow, sField)) {
                return oRow[sField];
            }

            oRow = mSavedDisplay[sKey];

            if (oRow &&
                Object.prototype.hasOwnProperty.call(oRow, sField)) {
                return oRow[sField];
            }

            return vOriginal == null ? "" : vOriginal;
        },

        getChanges: function () {
            return Object.keys(mChanges).map(function (sKey) {
                return Object.assign({}, mChanges[sKey]);
            });
        },

        // 只移除确认保存成功的记录
        confirmSaved: function (aRows) {
            aRows.forEach(function (oRow) {
                var sKey = makeKey(
                    oRow.SalesOrder,
                    oRow.SalesOrderItem
                );

                mSavedDisplay[sKey] = Object.assign(
                    {},
                    mSavedDisplay[sKey] || {},
                    mChanges[sKey] || {}
                );

                delete mChanges[sKey];
            });

            notifyChange();
        },

        // Go 查询时清空全部缓存
        clear: function () {
            mChanges = Object.create(null);
            mSavedDisplay = Object.create(null);
            notifyChange();
        }
    };
});