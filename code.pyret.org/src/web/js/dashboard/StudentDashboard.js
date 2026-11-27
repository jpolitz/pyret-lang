import React, { Component } from 'react';
import GoogleAPI from './GoogleAPI.js';
import {FILE_EXT, APP_NAME} from './config.js';
import File from './File';
import { mergeProgramFiles, parseFileIds, chunkArray } from './programFiles.js';

const NOT_SIGNED_IN = 1;
const WAITING_FOR_SIGNIN = 2;
const SIGNED_IN = 3;
const INITIAL_LOAD = 4;


const WAITING_FOR_FILES = [];

const PICKER_BATCH_SIZE = 50;


class StudentDashboard extends Component {
  constructor() {
    super();

    this.state = {
      signedIn: INITIAL_LOAD,
      files: [],
      filesError: false,
      activeTab: 'recent-files',
      newFileName: '',
      searchQuery: '',
      userName: false,
      addedMessage: false,
      manageOpen: false,
      pickerOpen: false,
      manageBusy: false,
      manageMessage: null,
      idsPanel: false,
      copiedIds: '',
      copied: false,
      pastedIds: ''
    };

    this.api = new GoogleAPI();
    var apiLoaded = this.api.load();
    apiLoaded.then((resp) => {
      if(resp.hasAuth()) {
        this.setState({signedIn: SIGNED_IN});
        this.updateRecentFiles();
        this.api.getUsername().then((userInfo) => {
          this.setState({ userName: userInfo.email });
        });
      }
      else {
        this.setState({ signedIn: NOT_SIGNED_IN });
      }
    });
    apiLoaded.fail((e) => {
      this.setState({ signedIn: NOT_SIGNED_IN });
    });
  }

  handleStartCodingClick = (event) => {
    window.open("/editor", "_blank");
  }

  handleSignInClick = (event) => {
    this.setState({signedIn: WAITING_FOR_SIGNIN});
    this.api.signIn().then((resp) => {
      this.setState({signedIn: SIGNED_IN});
      this.api.getUsername().then((userInfo) => {
        this.setState({ userName: userInfo.emailAddresses[0].value });
      });
      this.updateRecentFiles();
    })
    .fail((resp) => {
      this.setState({ signedIn: NOT_SIGNED_IN });
    });
  }

  handleSignOutClick = (event) => {
    this.setState({signedIn: NOT_SIGNED_IN});
    window.location.replace('/logout');
  }

  handleTabClick = (event) => {
    this.setState({activeTab: event.target.id});
    if (event.target.id === 'recent-files') {
      this.updateRecentFiles();
    }
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown = (event) => {
    if (event.key === 'Escape' && this.state.manageOpen && !this.state.pickerOpen) {
      this.handleManageCloseClick(event);
    }
  }

  updateRecentFiles = () => {
    this.setState({files: WAITING_FOR_FILES, filesError: false});
    this.api.getRecentFilesByExtAndAppName(APP_NAME, FILE_EXT).then((resp) => {
      this.setState({files: resp.result.files, filesError: false});
    }).catch((err) => {
      console.error("Failed to load files:", err);
      this.setState({
        files: [],
        filesError: 'Could not load files from Google Drive. Try refreshing or signing in again.',
      });
    });
  }

  handleSearchChange = (event) => {
    this.setState({searchQuery: event.target.value});
  }

  // All program files are loaded into this.state.files, so filtering locally
  // covers every file with arbitrary substring matching.
  getVisibleFiles = () => {
    if (this.state.files === WAITING_FOR_FILES) { return []; }
    const query = this.state.searchQuery.trim().toLowerCase();
    if (query === '') { return this.state.files; }
    return this.state.files.filter((f) => f.name.toLowerCase().includes(query));
  }

  handleNewFilenameChange = (event) => {
    this.setState({newFileName: event.target.value});
  }

  handleCreateNewFile = (event) => {
    event.preventDefault();
    var w = window.open("about:blank", "_blank");
    if (this.state.newFileName) {
      this.api.getAppFolderID(APP_NAME).then((resp) => {
        var files = resp.result.files;

        // App Folder did not yet exist
        if (files.length === 0) {
          this.api.createAppFolder(APP_NAME).then((resp) => {
            return this.api.createNewFile(resp.result.id, this.state.newFileName + '.arr').then((resp)=> {
              w.location = EDITOR_REDIRECT_URL + resp.result.id;
//              window.open(EDITOR_REDIRECT_URL + resp.result.id, '_newtab');
            });
          });
        }

        // App Folder already existed
        else {
          return this.api.createNewFile(files[0].id, this.state.newFileName + '.arr').then((resp) => {
            w.location = EDITOR_REDIRECT_URL + resp.result.id;
//            window.open(EDITOR_REDIRECT_URL + resp.result.id, '_newtab');
          });
        }
      });
    }
  }

  handleSelectFileClick = (event) => {
    var w = window.open("about:blank", "_blank");
    this.api.getAppFolderID(APP_NAME).then((resp) => {
      var files = resp.result.files;
      if(files.length === 0) {
        var urlToOpen = "https://drive.google.com/drive/u/0/";
      }
      else {
        var urlToOpen = "https://drive.google.com/drive/u/0/folders/" + files[0].id;
      }
      w.location = urlToOpen;
    }).fail((err) => {
      w.close();
    });
    /*
    this.api.createPicker(APP_NAME, (data) => {
      if (data.action === window.google.picker.Action.PICKED) {
        var fileId = data.docs[0].id;
        window.open(EDITOR_REDIRECT_URL + fileId, "_blank");
        window.picker.setVisible(false);
      }
    });
    */
  }

  addFiles = (ids) => {
    if (ids.length === 0) { return this.pickBatches([null]); }
    this.setState({manageBusy: true, manageMessage: null});
    return this.api.getVisibleFileIds().then((visible) => {
      var visibleSet = new Set(visible);
      var needed = ids.filter((id) => !visibleSet.has(id));
      if (needed.length === 0) {
        var msg = ids.length === 1
          ? 'That file is already accessible on this server.'
          : 'All ' + ids.length + ' files are already accessible on this server.';
        this.setState({manageBusy: false, pastedIds: '', manageMessage: {type: 'info', text: msg}});
        return 0;
      }
      return this.pickBatches(chunkArray(needed, PICKER_BATCH_SIZE));
    }).catch((err) => {
      console.error("Failed to check existing files:", err);
      this.setState({
        manageBusy: false,
        pickerOpen: false,
        manageMessage: {type: 'error', text: 'Could not reach Google Drive. Try refreshing or signing in again.'},
      });
      return 0;
    });
  }

  pickBatches = (batches) => {
    this.setState({manageBusy: true, pickerOpen: true, manageMessage: null});
    var added = [];
    var pickBatch = (n) => {
      if (n >= batches.length) { return added; }
      var batchLabel = batches.length > 1 ? ' (' + (n + 1) + ' of ' + batches.length + ')' : '';
      return this.api.openAddFilesPicker(batches[n], FILE_EXT, 'Add files to ' + APP_NAME + batchLabel, batchLabel).then((picked) => {
        if (picked === null) { return added; }
        added = added.concat(picked);
        return pickBatch(n + 1);
      });
    };
    return Q(pickBatch(0)).then((pickedIds) => {
      var uniqueIds = Array.from(new Set(pickedIds));
      if (uniqueIds.length === 0) {
        this.setState({manageBusy: false, pickerOpen: false});
        return 0;
      }
      return this.api.getProgramFilesByIds(uniqueIds, APP_NAME, FILE_EXT).then((programFiles) => {
        var addedMessage = programFiles.length === 0
          ? 'No new Pyret files were added.'
          : 'Added ' + programFiles.length + (programFiles.length === 1 ? ' file.' : ' files.');
        this.setState((prevState) => ({
          files: prevState.files === WAITING_FOR_FILES
            ? mergeProgramFiles([], programFiles)
            : mergeProgramFiles(prevState.files, programFiles),
          filesError: false,
          addedMessage: addedMessage,
          manageOpen: false,
          pickerOpen: false,
          manageBusy: false,
          manageMessage: null,
          idsPanel: false,
          pastedIds: '',
        }));
        return programFiles.length;
      });
    }).catch((err) => {
      console.error("Failed to add files:", err);
      this.setState({
        manageBusy: false,
        pickerOpen: false,
        manageMessage: {type: 'error', text: 'Could not add files from Google Drive. Try refreshing or signing in again.'},
      });
      return 0;
    });
  }

  handleManageClick = (event) => {
    this.setState({manageOpen: true, idsPanel: false, manageMessage: null});
  }

  handleManageCloseClick = (event) => {
    this.setState({manageOpen: false, idsPanel: false, manageMessage: null});
  }

  handleManageOverlayClick = (event) => {
    if (event.target === event.currentTarget) { this.handleManageCloseClick(event); }
  }

  handleAddFilesClick = (event) => {
    if (this.state.manageBusy) { return; }
    this.addFiles([]);
  }

  handleCopyIdsClick = (event) => {
    event.preventDefault();
    if (this.state.manageBusy) { return; }
    this.setState({manageBusy: true, manageMessage: null});
    this.api.getProgramFileIds(APP_NAME, FILE_EXT).then((ids) => {
      if (ids.length === 0) {
        this.setState({
          manageBusy: false,
          idsPanel: false,
          manageMessage: {type: 'info', text: 'No Pyret files found on this server to copy.'},
        });
        return;
      }
      var text = ids.join(',');
      this.setState({manageBusy: false, idsPanel: 'copy', copiedIds: text, copied: false});
      if (window.navigator.clipboard) {
        window.navigator.clipboard.writeText(text).then(() => {
          this.setState({copied: true});
        }, () => {});
      }
    }).catch((err) => {
      console.error("Failed to copy file IDs:", err);
      this.setState({
        manageBusy: false,
        manageMessage: {type: 'error', text: 'Could not read your file list. Try refreshing or signing in again.'},
      });
    });
  }

  handlePasteIdsClick = (event) => {
    event.preventDefault();
    this.setState({idsPanel: 'paste', manageMessage: null});
  }

  handlePastedIdsChange = (event) => {
    this.setState({pastedIds: event.target.value});
  }

  handleAddPastedIds = (event) => {
    event.preventDefault();
    if (this.state.manageBusy) { return; }
    var ids = parseFileIds(this.state.pastedIds);
    if (ids.length === 0) {
      this.setState({
        manageMessage: {type: 'error', text: 'No file IDs found. Paste the comma-separated IDs copied from the other server.'},
      });
      return;
    }
    this.addFiles(ids);
  }

  selectAll = (event) => {
    event.target.select();
  }

  // A simple callback implementation.
  pickerCallback = (data) => {
    if (data.action === window.google.picker.Action.PICKED) {
      var fileId = data.docs[0].id;
      window.open(EDITOR_REDIRECT_URL + fileId, "_blank");
    }
  }

  render = () => {
    const visibleFiles = this.getVisibleFiles();
    const isSearch = this.state.searchQuery.trim() !== '';
    return (
      <div className='wrap'>
        <div id='header' className=''>
          <div className='container'>
            <div className='left' aria-label='Welcome to Pyret'>
              <img src='/img/pyret-logo.png' aria-hidden='true' className='dashboard-logo'></img>
              <div className='header'>
                <h1 className='logo-text'>{APP_NAME}</h1>
                <h2 className={'person-text ' + (this.state.userName === false ? 'hidden' : '')}>{this.state.userName}</h2>
              </div>
            </div>
            <div className='button-wrapper right'>
              <button className={'auth-button ' + (this.state.signedIn !== NOT_SIGNED_IN ? '' : 'hidden')} onClick={this.handleSignOutClick} id='signout-button' >Sign out</button>
            </div>
            <div className='button-wrapper right start'>
              <button className={'start-button ' + (this.state.signedIn === SIGNED_IN ? '' : 'hidden')} onClick={this.handleStartCodingClick} id='start-button' >Open Editor</button>
            </div>
          </div>
        </div>
        <div className={'main middle container ' + (this.state.signedIn === NOT_SIGNED_IN ? '' : 'hidden')}>

          <div className={'middle large-logo-container'} aria-label='Pyret'>
            <img src="/img/pyret-logo.png" aria-hidden='true'></img>
          </div>

          <div className='clearfix'></div>


          <div className={'left'}>
            <p><button onClick={this.handleStartCodingClick} id='start-button' >Open Editor</button></p><p><em>to start coding immediately</em></p>
          </div>

          <div className={'right'}>
            <p><button className={'auth-button'} onClick={this.handleSignInClick} id='signin-button' >Sign in</button></p><p><em>to save and view programs</em></p>
          </div>

          <div className='clearfix'></div>

          <br/><br/>

          <p>You can also check out <a href="https://dcic-world.org/" aria-label="Pyret book">our book that uses Pyret</a> or <a href="http://www.bootstrapworld.org" aria-label="Bootstrap curricula">our curricula</a>.</p>

        </div>
        <div id='loading-spinner' className={this.state.signedIn === WAITING_FOR_SIGNIN ? '' : 'hidden'}>
          <h1>Waiting for login...</h1>
          <i className='fa fa-circle-o-notch fast-spin fa-3x fa-fw'></i>
        </div>
        <div id='file-picker-modal' className={'modal-wrap container ' + (this.state.signedIn === SIGNED_IN ? '' : 'hidden')}>
          <div id='file-picker-modal-tabs' className='cf'>
            <h2 id='recent-files' className={'tab floatable left ' + ((this.state.activeTab === 'recent-files') ? 'active' : '')} onClick={this.handleTabClick}>Recent Files</h2>
            <h2 id='new-file' className={'tab floatable left ' + ((this.state.activeTab === 'new-file') ? 'active' : '')} onClick={this.handleTabClick}>New File</h2>
            <div className='button-wrapper right'>
              <button id='manage' onClick={this.handleManageClick} >Manage</button>
              <button id='select-file' onClick={this.handleSelectFileClick} >View in Google Drive</button>
            </div>
          </div>
          <div id='file-search' className={(this.state.activeTab === 'new-file') ? 'hidden' : ''}>
            <input id='file-search-input' type='search' placeholder='Search your files by name' aria-label='Search your files by name'
              autoComplete='off' value={this.state.searchQuery} onChange={this.handleSearchChange} />
          </div>
          <div id='file-picker-modal-body' className={'modal-body ' + ((this.state.activeTab === 'new-file') ? 'hidden' : '')}>
            {!this.state.addedMessage ? null : <p id='added-files'>{this.state.addedMessage}</p>}
            {
              this.state.files === WAITING_FOR_FILES ?
              (<div id='loading-spinner'>
                <h2>Loading files...</h2>
                <i className='fa fa-circle-o-notch fast-spin fa-3x fa-fw'></i>
              </div>)
              :
                this.state.filesError ?
                  <p id='files-error' className='files-error'>{this.state.filesError}</p>
                :
                visibleFiles.length > 0 ?
                    (<div className='file-list cf'>
                      {visibleFiles.map((f) => {return <File key={f.id} id={f.id} name={f.name} modifiedTime={f.modifiedTime} />;})}
                    </div>)
                  : isSearch ?
                    <p><em>No files with names matching "{this.state.searchQuery.trim()}".</em></p>
                  :
                    <p><em>No Pyret files yet, use New File above to create one.</em></p>
            }
          </div>
          <div className={'modal-body ' + ((this.state.activeTab === 'new-file') ? '' : 'hidden')}>
            <form onSubmit={this.handleCreateNewFile}>
              <label className='input-label'>New file name:</label>
              <input className='form' type='text' value={this.state.newFileName} onChange={this.handleNewFilenameChange} />
              <span className='arr-ext'>.arr</span>
              <input id='new-file' className='button ' type='submit' value='Create' />
            </form>
          </div>
        </div>
        {!this.state.manageOpen ? null :
          <div id='manage-overlay' onClick={this.handleManageOverlayClick}>
            <div id='manage-modal' role='dialog' aria-modal='true'>
              <p>Missing some files?  Working in a different Pyret server?  Try one of these steps:</p>
              <ol id='manage-steps'>
                <li><button id='add-files' disabled={this.state.manageBusy} onClick={this.handleAddFilesClick} >Browse</button> your entire Drive to search for the missing files and give this server access to the files you choose</li>
                <li><button id='copy-ids' disabled={this.state.manageBusy} onClick={this.handleCopyIdsClick} >Copy</button> to your clipboard all the file IDs that <em>this</em> server can access, or</li>
                <li><button id='paste-ids' disabled={this.state.manageBusy} onClick={this.handlePasteIdsClick} >Paste</button> the file IDs from <em>another</em> server and give <em>this</em> server access to them</li>
              </ol>
              {!this.state.manageMessage ? null :
                <p id='manage-message' className={'manage-message ' + this.state.manageMessage.type}>{this.state.manageMessage.text}</p>}
              <div id='file-ids'>
                {this.state.idsPanel !== 'copy' ? null :
                  <div>
                    <p id='copied-ids-status'>{this.state.copied ? 'Copied.' : 'Copy these:'}</p>
                    <textarea id='copied-ids' readOnly value={this.state.copiedIds} onFocus={this.selectAll} />
                  </div>}
                {this.state.idsPanel !== 'paste' ? null :
                  <form onSubmit={this.handleAddPastedIds}>
                    <textarea id='pasted-ids' value={this.state.pastedIds} onChange={this.handlePastedIdsChange} />
                    <input id='add-pasted-ids' className='button' disabled={this.state.manageBusy} type='submit' value='Add files' />
                  </form>}
              </div>
              <p><button id='manage-close' onClick={this.handleManageCloseClick} >Close</button></p>
            </div>
          </div>}
        <div className='footer middle'>
          <p className='right'>
            <a target="_blank" href="https://www.pyret.org">pyret.org</a> | <a target="_blank" href={"https://" + process.env.APP_DOMAIN + "/faq/"}>Policies</a> | <a target="_blank" href="https://www.github.com/brownplt/code.pyret.org">Software</a></p>
        </div>

      </div>
    );
  }
}

export default StudentDashboard;
