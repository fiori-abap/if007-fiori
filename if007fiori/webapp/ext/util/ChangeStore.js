sap.ui.define(["sap/ui/model/json/JSONModel"], function (JSONModel) {
    "use strict";

    var FIELD_NAMES = ["CommentText", "FollowUpDate", "SapStatus", "CloudDeliveryDate", "ExternalStatus"];
    var mChanges = Object.create(null);
    var mSavedDisplay = Object.create(null);
    var mPendingByKey = Object.create(null);
    var mLastStatus = Object.create(null);
    var mHydrated = Object.create(null);
    var mHydrating = Object.create(null);
    var mHydrationErrors = Object.create(null);
    var fnReadSnapshot = null;
    var oAddonModel = null;
    var oSyncModel = null;
    var bBusy = false;
    var oStateModel = new JSONModel({revision: 0, busy: false});

    function normalize(v, size) {
        var s = String(v == null ? "" : v).trim();
        return /^\d+$/.test(s) && s.length <= size ? s.padStart(size, "0") : s;
    }
    function makeKey(order, item) {
        return JSON.stringify([normalize(order, 10), normalize(item, 6)]);
    }
    function copy(o) { return Object.assign({}, o); }
    function notify() { oStateModel.setProperty("/revision", oStateModel.getProperty("/revision") + 1); }
    function fromSnapshot(db) {
        return {
            row: {
                SalesOrder: normalize(db.SalesOrder, 10),
                SalesOrderItem: normalize(db.SalesOrderItem, 6),
                RequestId: db.RequestId,
                ChangeMask: db.ChangeMask || "00000",
                CommentText: db.PendingComment || "",
                FollowUpDate: db.PendingFollowUpDate || "",
                SapStatus: db.PendingSapStatus || "",
                CloudDeliveryDate: db.PendingDeliveryDate || "",
                ExternalStatus: db.PendingExternalStatus || ""
            },
            sapStatus: db.SapSaveState || "N",
            cloudStatus: db.CloudSaveState || "N",
            sapMessage: db.SapError || "",
            cloudMessage: db.CloudError || ""
        };
    }
    function hydrate(order, item) {
        var key = makeKey(order, item);
        if (mHydrated[key] || mHydrating[key] || mHydrationErrors[key] || !fnReadSnapshot) { return; }
        mHydrating[key] = Promise.resolve().then(function () {
            return fnReadSnapshot(order, item);
        }).then(function (db) {
            // Never overwrite an in-flight local save or newly entered edits.
            if (db && !mChanges[key] && !mPendingByKey[key]) {
                mLastStatus[key] = {sapStatus: db.SapSaveState || "N",
                    cloudStatus: db.CloudSaveState || "N",
                    sapMessage: db.SapError || "", cloudMessage: db.CloudError || ""};
                if (db.SapSaveState !== "S" || db.CloudSaveState !== "S") {
                    mPendingByKey[key] = fromSnapshot(db);
                }
            }
            mHydrated[key] = true;
            notify();
        }).catch(function (error) {
            // Do not permit editing if we cannot check for a stored failure.
            console.error("[IF007] 同步记录读取失败:", order, item, error);
            mHydrated[key] = false;
            mHydrationErrors[key] = true;
            notify();
        }).finally(function () { delete mHydrating[key]; });
    }
    function pending(order, item) { return mPendingByKey[makeKey(order, item)] || null; }
    function rowMode(order, item) {
        var key = makeKey(order, item);
        hydrate(order, item);
        if (!mHydrated[key]) { return null; }
        var p = pending(order, item);
        if (!p) { return "A"; }
        if (p.sapStatus === "E" && p.cloudStatus === "E") { return "A"; }
        if (p.sapStatus === "E" && p.cloudStatus === "S") { return "S"; }
        if (p.sapStatus === "S" && p.cloudStatus === "E") { return "C"; }
        return null; // P/U/N: an unknown/in-progress outcome must not be retried blindly
    }
    function selectionMode(contexts) {
        if (!Array.isArray(contexts) || !contexts.length || bBusy) { return null; }
        var mode;
        for (var c of contexts) {
            var current = rowMode(c.getProperty("SalesOrder"), c.getProperty("SalesOrderItem"));
            if (!current || (mode && mode !== current)) { return null; }
            mode = current;
        }
        return mode || null;
    }
    function getChangeMask(row) {
        return FIELD_NAMES.map(function (f) {
            return Object.prototype.hasOwnProperty.call(row, f) ? "1" : "0";
        }).join("");
    }
    function displayValue(p, field) {
        return p && p.row && Object.prototype.hasOwnProperty.call(p.row, field)
            ? p.row[field] : undefined;
    }

    return {
        getModel: function () { return oStateModel; },
        setAddonModel: function (model) { oAddonModel = model; },
        getAddonModel: function () { return oAddonModel; },
        setSyncModel: function (model) { oSyncModel = model; },
        getSyncModel: function () { return oSyncModel; },
        setHydrator: function (reader) { fnReadSnapshot = reader; },
        ensureHydrated: hydrate,
        isRowEditable: function (order, item) {
            hydrate(order, item);
            return !bBusy && !!mHydrated[makeKey(order, item)] && !pending(order, item);
        },
        setValue: function (context, field, value) {
            if (!context || !FIELD_NAMES.includes(field)) { return false; }
            var order = context.getProperty("SalesOrder"), item = context.getProperty("SalesOrderItem");
            if (order == null || item == null || !this.isRowEditable(order, item)) { return false; }
            var key = makeKey(order, item);
            if (!mChanges[key]) { mChanges[key] = { SalesOrder: order, SalesOrderItem: item }; }
            mChanges[key][field] = value;
            return true;
        },
        getValue: function (order, item, original, field) {
            hydrate(order, item);
            var key = makeKey(order, item);
            var modified = mChanges[key];
            if (modified && Object.prototype.hasOwnProperty.call(modified, field)) { return modified[field]; }
            var p = pending(order, item), pv = displayValue(p, field);
            if (pv !== undefined && p && p.row.ChangeMask && p.row.ChangeMask[FIELD_NAMES.indexOf(field)] === "1") {
                return pv;
            }
            var cached = mSavedDisplay[key];
            if (cached && Object.prototype.hasOwnProperty.call(cached, field)) { return cached[field]; }
            return original == null ? "" : original;
        },
        getChanges: function () { return Object.keys(mChanges).map(function (k) { return copy(mChanges[k]); }); },
        getChangeMask: getChangeMask,
        getModeForSelection: selectionMode,
        getPendingRow: function (order, item) {
            var p = pending(order, item);
            return p ? copy(p.row) : null;
        },
        beginRow: function (row) {
            var key = makeKey(row.SalesOrder, row.SalesOrderItem);
            mHydrated[key] = true;
            delete mHydrationErrors[key];
            mLastStatus[key] = {sapStatus: row.SapSaveState || "P", cloudStatus: row.CloudSaveState || "P",
                sapMessage: row.SapError || "", cloudMessage: row.CloudError || ""};
            mPendingByKey[key] = {
                row: copy(row), sapStatus: row.SapSaveState || "P", cloudStatus: row.CloudSaveState || "P",
                sapMessage: row.SapError || "", cloudMessage: row.CloudError || ""
            };
            notify();
        },
        setSideResult: function (row, side, state, message) {
            var p = pending(row.SalesOrder, row.SalesOrderItem);
            if (!p || !["S", "E", "U", "P"].includes(state)) { throw new Error("Invalid sync state"); }
            p[side + "Status"] = state;
            p[side + "Message"] = message || "";
            mLastStatus[makeKey(row.SalesOrder, row.SalesOrderItem)] = {
                sapStatus: p.sapStatus, cloudStatus: p.cloudStatus,
                sapMessage: p.sapMessage, cloudMessage: p.cloudMessage
            };
            notify();
        },
        finishRow: function (row) {
            var key = makeKey(row.SalesOrder, row.SalesOrderItem), p = mPendingByKey[key];
            if (!p || p.sapStatus !== "S" || p.cloudStatus !== "S") { return false; }
            mSavedDisplay[key] = Object.assign({}, mSavedDisplay[key] || {}, p.row);
            delete mChanges[key];
            delete mPendingByKey[key];
            notify();
            return true;
        },
        getRowStatusText: function (order, item) {
            hydrate(order, item);
            var p = pending(order, item);
            if (!p) { p = mLastStatus[makeKey(order, item)]; }
            if (!p) { return mHydrated[makeKey(order, item)] ? "未修改" : "读取中"; }
            return "SAP:" + p.sapStatus + " / Cloud:" + p.cloudStatus;
        },
        getRowStatusColor: function (order, item) {
            var p = pending(order, item) || mLastStatus[makeKey(order, item)];
            if (!p) { return "None"; }
            if (p.sapStatus === "E") { return "Error"; }
            if (p.cloudStatus === "E" || p.sapStatus === "U" || p.cloudStatus === "U" ||
                p.sapStatus === "P" || p.cloudStatus === "P") { return "Warning"; }
            if (p.sapStatus === "S" && p.cloudStatus === "S") { return "Success"; }
            return "None";
        },
        getRowError: function (order, item) {
            var p = pending(order, item) || mLastStatus[makeKey(order, item)];
            return p ? [p.sapMessage, p.cloudMessage].filter(Boolean).join(" / ") : "";
        },
        setBusy: function (busy) { bBusy = !!busy; oStateModel.setProperty("/busy", bBusy); notify(); },
        clear: function () {
            if (bBusy || Object.keys(mPendingByKey).length) { return false; }
            mChanges = Object.create(null);
            mSavedDisplay = Object.create(null);
            notify();
            return true;
        }
    };
});
