/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is
 * Alexander J. Vincent <ajvincent@gmail.com>.
 *
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL
 *
 * ***** END LICENSE BLOCK *****
 */

// Disables security checking our updates which haven't been signed
Services.prefs.setBoolPref("extensions.checkUpdateSecurity", false);

// Update check listener.
const checkListener = {
  pendingCount: 0,

  onUpdateAvailable: function onUpdateAvailable(aAddon, aInstall) {
    for (var i = 0; i < ADDONS.length; i++) {
      if (ADDONS[i].id == aAddon.id) {
        ADDONS[i].newInstall = aInstall;
        return;
      }
    }
  },

  onUpdateFinished: function onUpdateFinished() {
    if (--this.pendingCount == 0)
      next_test();
  }
}

// Get the HTTP server.
do_load_httpd_js();
var testserver;

var ADDONS = [
  // XPCShell
  {
    id: "bug299716-a@tests.mozilla.org",
    addon: "test_bug299716_a_1",
    installed: true,
    item: null,
    newInstall: null
  },

  // Toolkit
  {
    id: "bug299716-b@tests.mozilla.org",
    addon: "test_bug299716_b_1",
    installed: true,
    item: null,
    newInstall: null
  },

  // XPCShell + Toolkit
  {
    id: "bug299716-c@tests.mozilla.org",
    addon: "test_bug299716_c_1",
    installed: true,
    item: null,
    newInstall: null
  },

  // XPCShell (Toolkit invalid)
  {
    id: "bug299716-d@tests.mozilla.org",
    addon: "test_bug299716_d_1",
    installed: true,
    item: null,
    newInstall: null
  },

  // Toolkit (XPCShell invalid)
  {
    id: "bug299716-e@tests.mozilla.org",
    addon: "test_bug299716_e_1",
    installed: false,
    item: null,
    newInstall: null,
    failedAppName: "XPCShell"
  },

  // None (XPCShell, Toolkit invalid)
  {
    id: "bug299716-f@tests.mozilla.org",
    addon: "test_bug299716_f_1",
    installed: false,
    item: null,
    newInstall: null,
    failedAppName: "XPCShell"
  },

  // None (Toolkit invalid)
  {
    id: "bug299716-g@tests.mozilla.org",
    addon: "test_bug299716_g_1",
    installed: false,
    item: null,
    newInstall: null,
    failedAppName: "Toolkit"
  },
];

var next_test = function() {};

function do_check_item(aItem, aVersion, aAddonsEntry) {
  if (aAddonsEntry.installed) {
    if (aItem == null)
      do_throw("Addon " + aAddonsEntry.id + " wasn't detected");
    if (aItem.version != aVersion)
      do_throw("Addon " + aAddonsEntry.id + " was version " + aItem.version + " instead of " + aVersion);
  } else {
    if (aItem != null)
      do_throw("Addon " + aAddonsEntry.id + " was detected");
  }
}

/**
 * Start the test by installing extensions.
 */
function run_test() {
  do_test_pending();

  createAppInfo("xpcshell@tests.mozilla.org", "XPCShell", "5", "1.9");

  const dataDir = do_get_file("data");
  const addonsDir = do_get_addon(ADDONS[0].addon).parent;

  // Make sure we can actually get our data files.
  const xpiFile = addonsDir.clone();
  xpiFile.append("test_bug299716_a_2.xpi");
  do_check_true(xpiFile.exists());

  // Create and configure the HTTP server.
  testserver = new nsHttpServer();
  testserver.registerDirectory("/addons/", addonsDir);
  testserver.registerDirectory("/data/", dataDir);
  testserver.start(4444);

  // Make sure we can fetch the files over HTTP.
  const Ci = Components.interfaces;
  const xhr = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                        .createInstance(Ci.nsIXMLHttpRequest)
  xhr.open("GET", "http://localhost:4444/addons/test_bug299716_a_2.xpi", false);
  xhr.send(null);
  do_check_true(xhr.status == 200);

  xhr.open("GET", "http://localhost:4444/data/test_bug299716.rdf", false);
  xhr.send(null);
  do_check_true(xhr.status == 200);

  // Start the real test.
  startupManager();
  dump("\n\n*** INSTALLING NEW ITEMS\n\n");

  installAllFiles([do_get_addon(a.addon) for each (a in ADDONS)], run_test_pt2,
                  true);
}

/**
 * Check the versions of all items, and ask the extension manager to find updates.
 */
function run_test_pt2() {
  dump("\n\n*** DONE INSTALLING NEW ITEMS\n\n");
  dump("\n\n*** RESTARTING EXTENSION MANAGER\n\n");
  restartManager();

  AddonManager.getAddonsByIDs([a.id for each (a in ADDONS)], function(items) {
    dump("\n\n*** REQUESTING UPDATE\n\n");
    // checkListener will call run_test_pt3().
    next_test = run_test_pt3;

    // Try to update the items.
    for (var i = 0; i < ADDONS.length; i++) {
      var item = items[i];
      do_check_item(item, "0.1", ADDONS[i]);

      if (item) {
        checkListener.pendingCount++;
        ADDONS[i].item = item;
        item.findUpdates(checkListener, AddonManager.UPDATE_WHEN_USER_REQUESTED);
      }
    }
  });
}

/**
 * Install new items for each enabled extension.
 */
function run_test_pt3() {
  // Install the new items.
  dump("\n\n*** UPDATING ITEMS\n\n");
  completeAllInstalls([a.newInstall for each(a in ADDONS) if (a.newInstall)],
                      run_test_pt4);
}

/**
 * Check the final version of each extension.
 */
function run_test_pt4() {
  dump("\n\n*** RESTARTING EXTENSION MANAGER\n\n");
  restartManager();

  dump("\n\n*** FINAL CHECKS\n\n");
  AddonManager.getAddonsByIDs([a.id for each (a in ADDONS)], function(items) {
    for (var i = 0; i < ADDONS.length; i++) {
      var item = items[i];
      do_check_item(item, "0.2", ADDONS[i]);
    }

    testserver.stop(do_test_finished);
  });
}
