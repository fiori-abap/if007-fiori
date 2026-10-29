sap.ui.define(["zrap/if007/if007fiori/ext/util/ChangeStore"], function (ChangeStore) {
    "use strict";
    return {
        text: function (order, item) { return ChangeStore.getRowStatusText(order, item); },
        state: function (order, item) { return ChangeStore.getRowStatusColor(order, item); },
        tooltip: function (order, item) { return ChangeStore.getRowError(order, item); }
    };
});
