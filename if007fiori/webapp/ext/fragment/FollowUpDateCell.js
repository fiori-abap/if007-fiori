sap.ui.define([
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (ChangeStore) {
    "use strict";

    return {

        formatValue: function (sOrder, sItem, sOriginal) {
            return ChangeStore.getValue(
                sOrder,
                sItem,
                sOriginal,
                "FollowUpDate"
            );
        },

        onChange: function (oEvent) {

            // 日期无效时不记录
            if (oEvent.getParameter("valid") === false) {
                return;
            }

            var oDatePicker = oEvent.getSource();

            ChangeStore.setValue(
                oDatePicker.getBindingContext(),
                "FollowUpDate",
                oDatePicker.getValue()
            );
        }
    };
});