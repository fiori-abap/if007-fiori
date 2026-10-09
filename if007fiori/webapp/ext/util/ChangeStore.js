sap.ui.define([], function () {
    "use strict";

    // 按销售订单 + 明细番号保存修改
    var mChanges = Object.create(null);

    function makeKey(sOrder, sItem) {
        return JSON.stringify([sOrder, sItem]);
    }

    return {

        // 记录用户修改的字段
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

        // 显示缓存值；没有修改时显示后台原值
        getValue: function (sOrder, sItem, vOriginal, sField) {

            var oRow = mChanges[makeKey(sOrder, sItem)];

            if (oRow &&
                Object.prototype.hasOwnProperty.call(oRow, sField)) {
                return oRow[sField];
            }

            return vOriginal == null ? "" : vOriginal;
        },

        // 后续保存按钮将读取这里
        getChanges: function () {
            return Object.keys(mChanges).map(function (sKey) {
                return Object.assign({}, mChanges[sKey]);
            });
        },

        // 保存成功后清除缓存
        clear: function () {
            mChanges = Object.create(null);
        }
    };
});