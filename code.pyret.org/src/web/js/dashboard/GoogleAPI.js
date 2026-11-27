import {
  PROGRAM_FILE_FIELDS,
  isProgramFile,
  buildProgramListQuery,
  chunkArray,
} from './programFiles.js';

var FOLDER_MIME = "application/vnd.google-apps.folder";
class GoogleAPI {
  constructor() {
    this._excludedFolderIds = {};
  }

  /**
   * Run a gapi.client.drive request, refreshing the access token once on 401.
   */
  callDrive = (makeReq) => {
    return Q(makeReq()).catch((err) => {
      var code = err && (err.status || err.code || (err.result && err.result.error && err.result.error.code));
      if (code === 401) {
        return window.reauth(true).then((auth) => {
          if (!auth) { throw new Error("Not signed in"); }
          return Q(makeReq());
        });
      }
      throw err;
    });
  }
  /**
   *  Load the client library. Return a promise to allow .then() in caller
   */
  load = () => {
    return gwrap.load({name: 'drive',
      version: 'v3',
      reauth: {
        immediate: true
      }
    });
  }

  /**
   *  Sign in the user upon button click.
   */
  signIn = (event) => {
    return gwrap.load({name: 'drive',
      version: 'v3',
      reauth: {
        immediate: false
      }
    });
  }

  /**
   *  Sign out the user upon button click.
   */
  signOut = (event) => {
    throw "Can't sign out yet.";
  }

  createAppFolder = (appName) => {
    return window.gapi.client.drive.files.create({
      resource: {
        'name' : appName,
        'mimeType' : FOLDER_MIME
      }
    });
  }

  getAppFolderID = (appName) => {
    return window.gapi.client.drive.files.list({
      q: '("me" in owners) and not trashed and mimeType="application/vnd.google-apps.folder" and name ="' + appName + '"'
    });
  }

  getAppSharedFolderID = (appName) => {
    return this.callDrive(() => window.gapi.client.drive.files.list({
      q: '("me" in owners) and not trashed and mimeType="application/vnd.google-apps.folder" and name ="' + appName + '.shared"'
    }));
  }

  getAppCompiledFolderID = (appName) => {
    return this.callDrive(() => window.gapi.client.drive.files.list({
      q: '("me" in owners) and not trashed and mimeType="application/vnd.google-apps.folder" and name ="' + appName + '.compiled"'
    }));
  }

  getExcludedFolderIds = (appName) => {
    if (!this._excludedFolderIds[appName]) {
      this._excludedFolderIds[appName] = Q.all([
        this.getAppSharedFolderID(appName),
        this.getAppCompiledFolderID(appName),
      ]).then((resps) => {
        var ids = [];
        resps.forEach((resp) => {
          ((resp.result && resp.result.files) || []).forEach((f) => {
            if (f && f.id) { ids.push(f.id); }
          });
        });
        return ids;
      }).catch((err) => {
        delete this._excludedFolderIds[appName];
        throw err;
      });
    }
    return this._excludedFolderIds[appName];
  }

  createNewFile = (parentFolderId, fileName) => {
    var reqOpts = {
      'path': '/drive/v3/files',
      'method': 'POST',
      'body': {
        'parents': [parentFolderId],
        'mimeType': 'text/plain',
        'name': fileName
      }
    };
    return window.gapi.client.request(reqOpts);
  }

  listAllFiles = (params) => {
    var files = [];
    var getPage = (pageToken) => {
      return this.callDrive(() => window.gapi.client.drive.files.list(Object.assign({}, params, {
        fields: "nextPageToken, " + params.fields,
        pageSize: 1000,
        orderBy: "modifiedTime desc",
        pageToken: pageToken,
      }))).then((resp) => {
        files = files.concat((resp.result && resp.result.files) || []);
        return resp.result && resp.result.nextPageToken ? getPage(resp.result.nextPageToken) : { result: { files: files } };
      });
    };
    return getPage(undefined);
  }

  listProgramFiles = (appName, ext, nameFilter) => {
    return this.getExcludedFolderIds(appName).then((excludedIds) => {
      return this.listAllFiles({
        fields: "files(" + PROGRAM_FILE_FIELDS + ")",
        q: buildProgramListQuery(ext, excludedIds, nameFilter),
      }).then((resp) => {
        var filterOpts = { ext: ext, excludedParentIds: excludedIds };
        return { result: { files: resp.result.files.filter((f) => isProgramFile(f, filterOpts)) } };
      });
    });
  }

  getRecentFilesByExtAndAppName = (appName, ext, nameQuery) => {
    var nameFilter = "";
    if(nameQuery) {
      var escaped = nameQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      nameFilter = " and name contains '" + escaped + "'";
    }
    return this.listProgramFiles(appName, ext, nameFilter);
  }

  getProgramFilesByIds = (ids, appName, ext) => {
    return this.getExcludedFolderIds(appName).then((excludedIds) => {
      var filterOpts = { ext: ext, excludedParentIds: excludedIds };
      var chunks = chunkArray(ids, 20);
      var files = [];
      var getChunk = (i) => {
        if (i >= chunks.length) { return files; }
        return Q.all(chunks[i].map((id) => {
          return this.callDrive(() => window.gapi.client.drive.files.get({
            fileId: id,
            fields: PROGRAM_FILE_FIELDS,
          })).then((resp) => resp.result, (err) => {
            var code = err && (err.status || err.code || (err.result && err.result.error && err.result.error.code));
            if (code === 403 || code === 404) { return null; }
            throw err;
          });
        })).then((chunk) => {
          files = files.concat(chunk.filter((f) => isProgramFile(f, filterOpts)));
          return getChunk(i + 1);
        });
      };
      return Q(getChunk(0));
    });
  }

  getVisibleFileIds = () => {
    return this.listAllFiles({ fields: "files(id)", q: 'not trashed' })
      .then((resp) => resp.result.files.map((f) => f.id));
  }

  getProgramFileIds = (appName, ext) => {
    return this.listProgramFiles(appName, ext, "").then((resp) => resp.result.files.map((f) => f.id));
  }

  /**
   * list files w/ extension [ext].
   */
  getRecentFilesByExt = (ext, nameFilter) => {
    return this.listAllFiles({
      fields: "files(id, name, modifiedTime)",
      q: 'not trashed and fileExtension="' + ext + '"' + (nameFilter || ""),
    });
  }

  getAppDataFileID = (appDataFilename) => {
    return window.gapi.client.drive.files.list({
      q: 'not trashed and name="' + appDataFilename + '"',
      spaces: 'appDataFolder'
    });
  }

  createAppDataFile = (appDataFilename) => {
    return window.gapi.client.drive.files.create({
      resource: {
        name: appDataFilename,
        parents: ['appDataFolder']
      }
    });
  }

  getAppDataFileContent = (fileId) => {
    return window.gapi.client.drive.files.get({
      fileId: fileId,
      // Download a file — files.get with alt=media file resource
      alt: 'media'
    });
  }

  saveAppData = (fileId, appData) => {
    return window.gapi.client.drive.files.update({
      path: '/upload/drive/v3/files/' + fileId,
      method: 'PATCH',
      params: {
        uploadType: 'media'
      },
      body: JSON.stringify(appData)
    });
  }

  // Create and render a Google Picker object for selecting a file.
  createPicker = (appName, callback) => {
    window.gapi.load('picker', () => {
      this.getAppFolderID(appName).then((resp) => {
        var driveView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS).setIncludeFolders(true);
        if(resp.result.files.length !== 0) {
          driveView.setParent(resp.result.files[0].id);
        }
        window.picker = new window.google.picker.PickerBuilder()
          .setTitle("Select a Pyret document")
          .addView(driveView)
          .setOAuthToken(window.gapi.auth.getToken().access_token)
          .setCallback(callback)
          .setOrigin(window.location.protocol + '//' + window.location.host)
          .build();

        window.picker.setVisible(true);
      })
    });
  }

  openAddFilesPicker = (fileIds, ext, title, batchLabel) => {
    var done = Q.defer();
    window.reauth(true).then((auth) => {
      if(!auth) { done.reject(new Error("Not signed in")); return; }
      window.gapi.load('picker', () => {
        try {
          var picker = window.google.picker;
          var listView = (label) => {
            var view = new picker.DocsView(picker.ViewId.DOCS).setMode(picker.DocsViewMode.LIST);
            if(view.setLabel) { view.setLabel(label); }
            return view;
          };
          var views = fileIds
            ? [listView('Files' + batchLabel).setFileIds(fileIds.join(','))]
            : [listView('Pyret files').setMimeTypes('text/plain').setQuery('.' + ext + ' -title:"shared-gdrive"'), listView('My Drive').setMimeTypes('text/plain').setIncludeFolders(true).setParent('root')];
          var builder = new picker.PickerBuilder()
            .enableFeature(picker.Feature.MULTISELECT_ENABLED)
            .setTitle(title)
            .setOAuthToken(auth.access_token)
            .setAppId(window.appId)
            .setCallback((data) => {
              var action = data[picker.Response.ACTION];
              if(action === picker.Action.PICKED) {
                done.resolve((data[picker.Response.DOCUMENTS] || []).map((d) => d[picker.Document.ID]));
              }
              else if(action === picker.Action.CANCEL) {
                done.resolve(null);
              }
            });
          if(window.apiKey) { builder.setDeveloperKey(window.apiKey); }
          views.forEach((v) => { builder.addView(v); });
          builder.build().setVisible(true);
        } catch (err) {
          done.reject(err);
        }
      });
    }, (err) => {
      done.reject(err);
    });
    return done.promise;
  }

  getUsername = () => {
    var token = window.gapi.auth.getToken().access_token;
    return fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + token }
    }).then((resp) => resp.json());
  }
}

export default GoogleAPI;
