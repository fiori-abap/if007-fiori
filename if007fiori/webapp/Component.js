sap.ui.define([
    "sap/fe/core/AppComponent",
    "zrap/if007/if007fiori/ext/util/ChangeStore",
    "zrap/if007/if007fiori/ext/util/SyncPersistence"
], function (AppComponent, ChangeStore, SyncPersistence) {
    "use strict";
    return AppComponent.extend("zrap.if007.if007fiori.Component", {
        metadata: { manifest: "json" },
        init: function () {
            AppComponent.prototype.init.apply(this, arguments);
            this.setModel(ChangeStore.getModel(), "changeState");
            ChangeStore.setAddonModel(this.getModel("addon"));
            ChangeStore.setSyncModel(this.getModel("sync"));
            ChangeStore.setHydrator(SyncPersistence.readSnapshot);
            console.log("[IF007] Sync Model ready:", !!ChangeStore.getSyncModel());
        }
    });
});
