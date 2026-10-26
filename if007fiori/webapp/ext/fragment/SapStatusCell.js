sap.ui.define([
    "zrap/if007/if007fiori/ext/util/ChangeStore",
    "sap/m/MessageToast"
], function (ChangeStore, MessageToast) {
    "use strict";
    return {
        formatValue: function (sOrder, sItem, sOriginal) {
            return ChangeStore.getValue(sOrder, sItem, sOriginal, "SapStatus");
        },
        isEditable: function (sOrder, sItem) {
            return ChangeStore.isRowEditable(sOrder, sItem);
        },
        onSelectionChange: function (oEvent) {
            var oComboBox = oEvent.getSource();
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) {
                return;
            }
            ChangeStore.setValue(oComboBox.getBindingContext(), "SapStatus", oItem.getKey());
        },
        onChange: function (oEvent) {
            var oComboBox = oEvent.getSource();
            var oItem = oComboBox.getSelectedItem();
            if (oItem && oComboBox.getValue() === oItem.getText()) {
                ChangeStore.setValue(
                    oComboBox.getBindingContext(), "SapStatus", oItem.getKey()
                );
                return;
            }
            var oContext = oComboBox.getBindingContext();
            if (!oContext) {
                return;
            }
            var sPrevious = ChangeStore.getValue(
                oContext.getProperty("SalesOrder"),
                oContext.getProperty("SalesOrderItem"),
                oContext.getProperty("SapStatus"),
                "SapStatus"
            );
            oComboBox.setSelectedKey(sPrevious || "");
            if (!sPrevious) {
                oComboBox.setValue("");
            }
            MessageToast.show("请从下拉列表中选择状态");
        }
    };
});
