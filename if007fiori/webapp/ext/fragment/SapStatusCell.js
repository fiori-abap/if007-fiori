sap.ui.define([
    "zrap/if007/if007fiori/ext/util/ChangeStore",
    "sap/m/MessageToast"
], function (ChangeStore, MessageToast) {
    "use strict";

    return {

        // 优先显示缓存里的状态
        formatValue: function (sOrder, sItem, sOriginal) {
            return ChangeStore.getValue(
                sOrder,
                sItem,
                sOriginal,
                "SapStatus"
            );
        },

        // 用户选择下拉状态时记录修改
        onSelectionChange: function (oEvent) {

            var oComboBox = oEvent.getSource();
            var oItem = oEvent.getParameter("selectedItem");

            if (!oItem) {
                return;
            }

            ChangeStore.setValue(
                oComboBox.getBindingContext(),
                "SapStatus",
                oItem.getKey()
            );
        },

        // 防止用户手动输入不在选项中的文字
        onChange: function (oEvent) {

            var oComboBox = oEvent.getSource();
            var oItem = oComboBox.getSelectedItem();

            if (oItem &&
                oComboBox.getValue() === oItem.getText()) {

                ChangeStore.setValue(
                    oComboBox.getBindingContext(),
                    "SapStatus",
                    oItem.getKey()
                );

                return;
            }

            // 输入无效时恢复之前的状态
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