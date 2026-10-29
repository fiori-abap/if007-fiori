#!/usr/bin/env python3
"""Run from the current local IF007-FIORI root (directory containing if007fiori)."""
import json
from pathlib import Path

p = Path("if007fiori/webapp/manifest.json")
if not p.exists():
    raise SystemExit("ERROR: run this script from IF007-FIORI project root")
text = p.read_text(encoding="utf-8-sig")
manifest = json.loads(text)
sources = manifest["sap.app"]["dataSources"]
sources["syncService"] = {
    "uri": "/sap/opu/odata4/sap/zui_if007_sync_o4/srvd/sap/zui_if007_sync/0001/",
    "type": "OData", "settings": {"odataVersion": "4.0"}
}
models = manifest["sap.ui5"]["models"]
models["sync"] = {"dataSource": "syncService", "preload": False, "settings": {
    "operationMode": "Server", "groupId": "$direct", "updateGroupId": "$direct"
}}
settings = manifest["sap.ui5"]["routing"]["targets"]["OverviewList"]["options"]["settings"]
cols = settings["controlConfiguration"]["@com.sap.vocabularies.UI.v1.LineItem"]["columns"]
cols["CloudDeliveryDateEditCell"] = {
    "header": "Cloud纳入予定日（编辑）", "width": "13rem",
    "position": {"anchor": "DataField::CloudDeliveryDate", "placement": "After"},
    "template": "zrap.if007.if007fiori.ext.fragment.CloudDeliveryDateCell"
}
cols["ExternalStatusEditCell"] = {
    "header": "外部ステータス（编辑）", "width": "13rem",
    "position": {"anchor": "DataField::ExternalStatus", "placement": "After"},
    "template": "zrap.if007.if007fiori.ext.fragment.ExternalStatusCell"
}
cols["SyncResultCell"] = {
    "header": "同步保存结果", "width": "15rem",
    "position": {"anchor": "DataField::SyncStatus", "placement": "After"},
    "template": "zrap.if007.if007fiori.ext.fragment.SyncResultCell"
}
backup = p.with_name("manifest.before_integrated_patch.json")
if not backup.exists():
    backup.write_text(text, encoding="utf-8")
p.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("OK: manifest.json updated; backup: ", backup)
