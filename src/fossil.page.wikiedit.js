(function(F/*the fossil object*/){
  "use strict";
  /**
     Client-side implementation of the /wikiedit app. Requires that
     the fossil JS bootstrapping is complete and that several fossil
     JS APIs have been installed: fossil.fetch, fossil.dom,
     fossil.tabs, fossil.storage, fossil.confirmer.

     Custom events which can be listened for via
     fossil.page.addEventListener():

     - Event 'wiki-page-loaded': passes on information when it
     loads a wiki (whether from the network or its internal local-edit
     cache), in the form of an "winfo" object:

     {
       name: string,
       mimetype: mimetype string,
       type: "normal" | "tag" | "checkin" | "branch" | "sandbox",
       version: UUID string or null for a sandbox page,
       parent: parent UUID string or null if no parent,
       content: string
     }

     The internal docs and code frequently use the term "winfo", and such
     references refer to an object with that form.

     The fossil.page.wikiContent() method gets or sets the current
     file content for the page.

     - Event 'wiki-saved': is fired when a commit completes,
     passing on the same info as fileedit-file-loaded.

     - Event 'wiki-content-replaced': when the editor's content is
     replaced, as opposed to it being edited via user
     interaction. This normally happens via selecting a file to
     load. The event detail is the fossil.page object, not the current
     file content.

     - Event 'wiki-preview-updated': when the preview is refreshed
     from the server, this event passes on information about the preview
     change in the form of an object:

     {
     element: the DOM element which contains the content preview.
     mimetype: the page's mimetype.
     }

     Here's an example which can be used with the highlightjs code
     highlighter to update the highlighting when the preview is
     refreshed in "wiki" mode (which includes fossil-native wiki and
     markdown):

     fossil.page.addEventListener(
       'wiki-preview-updated',
       (ev)=>{
         if(ev.detail.mimetype!=='text/plain'){
           ev.detail.element.querySelectorAll(
             'code[class^=language-]'
           ).forEach((e)=>hljs.highlightBlock(e));
         }
       }
     );
  */
  const E = (s)=>document.querySelector(s),
        D = F.dom,
        P = F.page;

  P.config = {};

  /**
     $stash is an internal-use-only object for managing "stashed"
     local edits, to help avoid that users accidentally lose content
     by switching tabs or following links or some such. The basic
     theory of operation is...

     All "stashed" state is stored using fossil.storage.

     - When the current wiki content is modified by the user, the
       current state of the page is stashed.

     - When saving, the stashed entry for the previous version is
       removed from the stash.

     - When "loading", we use any stashed state for the given
       checkin/file combination. When forcing a re-load of content,
       any stashed entry for that combination is removed from the
       stash.

     - Every time P.stashContentChange() updates the stash, it is
       pruned to $stash.prune.defaultMaxCount most-recently-updated
       entries.

     - This API often refers to "winfo objects." Those are objects
       with a minimum of {page,mimetype} properties (which must be
       valid), and the page name is used as basis for the stash keys
       for any given page.

     The structure of the stash is a bit convoluted for efficiency's
     sake: we store a map of file info (winfo) objects separately from
     those files' contents because otherwise we would be required to
     JSONize/de-JSONize the file content when stashing/restoring it,
     and that would be horribly inefficient (meaning "battery-consuming"
     on mobile devices).
  */
  const $stash = {
    keys: {
      index: F.page.name+'/index'
    },
    /**
       index: {
       "PAGE_NAME": {wiki page info w/o content}
       ...
       }

       In F.storage we...

       - Store this.index under the key this.keys.index.

       - Store each page's content under the key
       (P.name+'/PAGE_NAME'). These are stored separately from the
       index entries to avoid having to JSONize/de-JSONize the
       content. The assumption/hope is that the browser can store
       those records "directly," without any intermediary
       encoding/decoding going on.
    */
    indexKey: function(winfo){return winfo.name},
    /** Returns the key for storing content for the given key suffix,
        by prepending P.name to suffix. */
    contentKey: function(suffix){return P.name+'/'+suffix},
    /** Returns the index object, fetching it from the stash or creating
        it anew on the first call. */
    getIndex: function(){
      if(!this.index){
        this.index = F.storage.getJSON(
          this.keys.index, {}
        );
      }
      return this.index;
    },
    _fireStashEvent: function(){
      if(this._disableNextEvent) delete this._disableNextEvent;
      else F.page.dispatchEvent('wiki-stash-updated', this);
    },
    /**
       Returns the stashed version, if any, for the given winfo object.
    */
    getWinfo: function(winfo){
      const ndx = this.getIndex();
      return ndx[this.indexKey(winfo)];
    },
    /** Serializes this object's index to F.storage. Returns this. */
    storeIndex: function(){
      if(this.index) F.storage.setJSON(this.keys.index,this.index);
      return this;
    },
    /** Updates the stash record for the given winfo
        and (optionally) content. If passed 1 arg, only
        the winfo stash is updated, else both the winfo
        and its contents are (re-)stashed. Returns this.
    */
    updateWinfo: function(winfo,content){
      const ndx = this.getIndex(),
            key = this.indexKey(winfo),
            old = ndx[key];
      const record = old || (ndx[key]={
        name: winfo.name
      });
      record.mimetype = winfo.mimetype;
      record.type = winfo.type;
      record.parent = winfo.parent;
      record.version = winfo.version;      
      record.stashTime = new Date().getTime();
      this.storeIndex();
      if(arguments.length>1){
        F.storage.set(this.contentKey(key), content);
      }
      this._fireStashEvent();
      return this;
    },
    /**
       Returns the stashed content, if any, for the given winfo
       object.
    */       
    stashedContent: function(winfo){
      return F.storage.get(this.contentKey(this.indexKey(winfo)));
    },
    /** Returns true if we have stashed content for the given winfo
        record or page name. */
    hasStashedContent: function(winfo){
      if('string'===typeof winfo) winfo = {name: winfo};
      return F.storage.contains(this.contentKey(this.indexKey(winfo)));
    },
    /** Unstashes the given winfo record and its content.
        Returns this. */
    unstash: function(winfo){
      const ndx = this.getIndex(),
            key = this.indexKey(winfo);
      delete winfo.stashTime;
      delete ndx[key];
      F.storage.remove(this.contentKey(key));
      this.storeIndex();
      this._fireStashEvent();
      return this;
    },
    /**
       Clears all $stash entries from F.storage. Returns this.
     */
    clear: function(){
      const ndx = this.getIndex(),
            self = this;
      let count = 0;
      Object.keys(ndx).forEach(function(k){
        ++count;
        const e = ndx[k];
        delete ndx[k];
        F.storage.remove(self.contentKey(k));
      });
      F.storage.remove(this.keys.index);
      delete this.index;
      if(count) this._fireStashEvent();
      return this;
    },
    /**
       Removes all but the maxCount most-recently-updated stash
       entries, where maxCount defaults to this.prune.defaultMaxCount.
    */
    prune: function f(maxCount){
      const ndx = this.getIndex();
      const li = [];
      if(!maxCount || maxCount<0) maxCount = f.defaultMaxCount;
      Object.keys(ndx).forEach((k)=>li.push(ndx[k]));
      li.sort((l,r)=>l.stashTime - r.stashTime);
      let n = 0;
      while(li.length>maxCount){
        ++n;
        const e = li.shift();
        this._disableNextEvent = true;
        this.unstash(e);
        console.warn("Pruned oldest local file edit entry:",e);
      }
      if(n) this._fireStashEvent();
    }
  };
  $stash.prune.defaultMaxCount = P.config.defaultMaxStashSize || 10;
  P.$stash = $stash /* we have to expose this for the new-page case :/ */;
  
  /**
     Internal workaround to select the current preview mode
     and fire a change event if the value actually changes
     or if forceEvent is truthy.
  */
  P.selectMimetype = function(modeValue, forceEvent){
    const s = this.e.selectMimetype;
    if(!modeValue) modeValue = s.value;
    else if(s.value != modeValue){
      s.value = modeValue;
      forceEvent = true;
    }
    if(forceEvent){
      // Force UI update
      s.dispatchEvent(new Event('change',{target:s}));
    }
  };

  const WikiList = {
    e: {},
    /** Updates OPTION elements to reflect whether the page has
        local changes or is new/unsaved. */
    refreshStashMarks: function(){
      const sel = this.e.select;
      Object.keys(sel.options).forEach(function(key){
        const opt = sel.options[key];
        const stashed = $stash.getWinfo({name:opt.value});
        if(stashed){
          const isNew = 'sandbox'===stashed.type ? false : !stashed.version;
          D.addClass(opt, isNew ? 'stashed-new' :'stashed');
        }else{
          D.removeClass(opt, 'stashed', 'stashed-new');
        }
      });
    },
    /** Removes the given wiki page entry from the page selection
        list, if it's in the list. */
    removeEntry: function(name){
      const sel = this.e.select;
      const ndx = sel.selectedIndex;
      sel.value = name;
      if(sel.selectedIndex>-1){
        sel.options.remove(sel.selectedIndex);
      }
      sel.selectedIndex = ndx;
    },
    /**
       Installs a wiki page selection list into the given parent DOM
       element and loads the page list from the server.
    */
    init: function(parentElem){
      const sel = D.select(), btn = D.button("Reload page list");
      this.e.select = sel;
      D.addClass(parentElem, 'wikiedit-page-list-wrapper');
      D.clearElement(parentElem);
      D.append(
        parentElem,
        D.append(D.span(), "Select a page to edit:"),
        sel,
        D.append(D.span(), "[*] = page has local edits"),
        D.append(D.span(), "[+] = page is new/unsaved"),
        btn
      );
      D.attr(sel, 'size', 10);
      D.option(D.disable(D.clearElement(sel)), "Loading...");
      const self = this;
      btn.addEventListener(
        'click',
        function click(){
          if(!click.sorticase){
            click.sorticase = function(l,r){
              l = l.toLowerCase();
              r = r.toLowerCase();
              return l<=r ? -1 : 1;
            };
          }
          F.fetch('wikiajax/list',{
            responseType: 'json',
            onload: function(list){
              /* Jump through some hoops to integrate new/unsaved
                 pages into the list of existing pages... We use a map
                 as an intermediary in order to filter out any local-stash
                 dupes from server-side copies. */
              const map = {}, ndx = $stash.getIndex();
              D.clearElement(sel);
              list.forEach((name)=>map[name] = true);
              Object.keys(ndx).forEach(function(key){
                const winfo = ndx[key];
                if(!winfo.version/*new page*/) map[winfo.name] = true;
              });
              Object.keys(map)
                .sort(click.sorticase)
                .forEach((name)=>D.option(sel, name));
              D.enable(sel);
              if(P.winfo) sel.value = P.winfo.name;
              self.refreshStashMarks();
            }
          });
        },
        false
      );
      btn.click();
      sel.addEventListener(
        'change',
        (e)=>P.loadPage(e.target.value),
        false
      );
      F.page.addEventListener(
        'wiki-stash-updated',
        ()=>this.refreshStashMarks(),
        false
      );
      delete this.init;
    }
  };

  /**
     Keep track of how many in-flight AJAX requests there are so we
     can disable input elements while any are pending. For
     simplicity's sake we simply disable ALL OF IT while any AJAX is
     pending, rather than disabling operation-specific UI elements,
     which would be a huge maintenance hassle.

     Noting, however, that this global on/off is not *quite*
     pedantically correct. Pedantically speaking. If an element is
     disabled before an XHR starts, this code "should" notice that and
     not include it in the to-re-enable list. That would be annoying
     to do, and becomes impossible to do properly once multiple XHRs
     are in transit and an element is disabled seprately between two
     of those in-transit requests (that would be an unlikely, but
     possible, corner case).
  */
  const ajaxState = {
    count: 0 /* in-flight F.fetch() requests */,
    toDisable: undefined /* elements to disable during ajax activity */
  };
  F.fetch.beforesend = function f(){
    if(!ajaxState.toDisable){
      ajaxState.toDisable = document.querySelectorAll(
        ['button:not([disabled])',
         'input:not([disabled])',
         'select:not([disabled])',
         'textarea:not([disabled])'
        ].join(',')
      );
    }
    if(1===++ajaxState.count){
      D.addClass(document.body, 'waiting');
      D.disable(ajaxState.toDisable);
    }
  };
  F.fetch.aftersend = function(){
    if(0===--ajaxState.count){
      D.removeClass(document.body, 'waiting');
      D.enable(ajaxState.toDisable);
    }
  };

  F.onPageLoad(function() {
    document.body.classList.add('wikiedit');
    P.base = {tag: E('base'), wikiUrl: F.repoUrl('wiki')};
    P.base.originalHref = P.base.tag.href;
    P.tabs = new fossil.TabManager('#wikiedit-tabs');
    P.e = { /* various DOM elements we work with... */
      taEditor: E('#wikiedit-content-editor'),
//      btnCommit: E("#wikiedit-btn-commit"),
      btnReload: E("#wikiedit-tab-content button.wikiedit-content-reload"),
      selectMimetype: E('select[name=mimetype]'),
      selectFontSizeWrap: E('#select-font-size'),
//      selectDiffWS:  E('select[name=diff_ws]'),
      cbAutoPreview: E('#cb-preview-autoupdate > input[type=checkbox]'),
      previewTarget: E('#wikiedit-tab-preview-wrapper'),
      diffTarget: E('#wikiedit-tab-diff-wrapper'),
      tabs:{
        pageList: E('#wikiedit-tab-pages'),
        content: E('#wikiedit-tab-content'),
        preview: E('#wikiedit-tab-preview'),
        diff: E('#wikiedit-tab-diff')
        //commit: E('#wikiedit-tab-commit')
      }
    };

    P.tabs.e.container.insertBefore(
      /* Move the status bar between the tab buttons and
         tab panels. Seems to be the best fit in terms of
         functionality and visibility. */
      E('#fossil-status-bar'), P.tabs.e.tabs
    );

    P.tabs.addEventListener(
      /* Set up auto-refresh of the preview tab... */
      'before-switch-to', function(ev){
        if(ev.detail===P.e.tabs.preview){
          P.baseHrefForWiki();
          if(P.previewNeedsUpdate && P.e.cbAutoPreview.checked) P.preview();
        }else if(ev.detail===P.e.tabs.diff){
          /* Work around a weird bug where the page gets wider than
             the window when the diff tab is NOT in view and the
             current SBS diff widget is wider than the window. When
             the diff IS in view then CSS overflow magically reduces
             the page size again. Weird. Maybe FF-specific. Note that
             this weirdness happens even though P.e.diffTarget's parent
             is hidden (and therefore P.e.diffTarget is also hidden).
          */
          D.removeClass(P.e.diffTarget, 'hidden');
        }
      }
    );
    P.tabs.addEventListener(
      /* Set up auto-refresh of the preview tab... */
      'before-switch-from', function(ev){
        if(ev.detail===P.e.tabs.preview){
          P.baseHrefRestore();
        }else if(ev.detail===P.e.tabs.diff){
          /* See notes in the before-switch-to handler. */
          D.addClass(P.e.diffTarget, 'hidden');
        }
      }
    );

    F.connectPagePreviewers(
      P.e.tabs.preview.querySelector(
        '#btn-preview-refresh'
      )
    );

    const diffButtons = E('#wikiedit-tab-diff-buttons');
    diffButtons.querySelector('button.sbs').addEventListener(
      "click",(e)=>P.diff(true), false
    );
    diffButtons.querySelector('button.unified').addEventListener(
      "click",(e)=>P.diff(false), false
    );
    if(0) P.e.btnCommit.addEventListener(
      "click",(e)=>P.commit(), false
    );
    F.confirmer(P.e.btnReload, {
      confirmText: "Really reload, losing edits?",
      onconfirm: function(e){
        const w = P.winfo;
        if(!w){
          F.error("No page loaded.");
          return;
        }
        if(!w.version/* new/unsaved page */ && P.wikiContent()){
          F.error("This new/unsaved page has content.",
                  "To really discard this page,",
                  "first clear its content",
                  "then use the Discard button.");
          return;
        }
        P.unstashContent()
        if(w.version){
          P.loadPage();
        }else{
          delete P.winfo;
          WikiList.removeEntry(w.name);
          P.updatePageTitle();
          F.message("Discarded new page ["+w.name+"].");
        }
      },
      ticks: 3
    });
    P.e.taEditor.addEventListener(
      'change', ()=>P.stashContentChange(), false
    );
    
    P.selectMimetype(false, true);
    P.e.selectMimetype.addEventListener(
      'change',
      function(e){
        if(P.winfo){
          P.winfo.mimetype = e.target.value;
          P.stashContentChange(true);
        }
      },
      false
    );
    
    const selectFontSize = E('select[name=editor_font_size]');
    if(selectFontSize){
      selectFontSize.addEventListener(
        "change",function(e){
          const ed = P.e.taEditor;
          ed.className = ed.className.replace(
              /\bfont-size-\d+/g, '' );
          ed.classList.add('font-size-'+e.target.value);
        }, false
      );
      selectFontSize.dispatchEvent(
        // Force UI update
        new Event('change',{target:selectFontSize})
      );
    }

    P.addEventListener(
      // Clear certain views when new content is loaded/set
      'wiki-content-replaced',
      ()=>{
        P.previewNeedsUpdate = true;
        D.clearElement(P.e.diffTarget, P.e.previewTarget);
      }
    );
    P.addEventListener(
      // Clear certain views after a save
      'wiki-saved',
      (e)=>{
        D.clearElement(P.e.diffTarget, P.e.previewTarget);
        // TODO: replace preview with new content
      }
    );
    WikiList.init( P.e.tabs.pageList.firstElementChild );
    P.addEventListener(
      // Update various state on wiki page load
      'wiki-page-loaded',
      function(ev){
        delete P.winfo;
        const winfo = ev.detail;
        P.winfo = winfo;
        P.previewNeedsUpdate = true;
        P.e.selectMimetype.value = winfo.mimetype;
        P.tabs.switchToTab(P.e.tabs.content);
        P.wikiContent(winfo.content || '');
        WikiList.e.select.value = winfo.name;
        if(!winfo.version){
          F.error('You are editing a new, unsaved page:',winfo.name);
        }
        P.updatePageTitle();
      },
      false
    );
  }/*F.onPageLoad()*/);

  /**
     Returns true if fossil.page.winfo is set, indicating that a page
     has been loaded, else it reports an error and returns false.

     If passed a truthy value any error message about not having
     a wiki page loaded is suppressed.
  */
  const affirmPageLoaded = function(quiet){
    if(!P.winfo && !quiet) F.error("No wiki page is loaded.");
    return !!P.winfo;
  };

  /**
     Update the page title and header based on the state of
     this.winfo. A no-op if this.winfo is not set. Returns this.
  */
  P.updatePageTitle = function f(){
    if(!f.titleElement){
      f.titleElement = document.head.querySelector('title');
      f.pageTitleHeader = document.querySelector('div.header .title');
    }
    var title = ['Wiki Editor:'];
    if(P.winfo){
      if(!P.winfo.version) title.push('[+]');
      else if($stash.getWinfo(P.winfo)) title.push('[*]')
      title.push(P.winfo.name);
    }else{
      title.push('(no page loaded)');
    }
    title = title.join(' ');
    f.titleElement.innerText = title;
    f.pageTitleHeader.innerText = title;
    return this;
  };
  
  /**
     Getter (if called with no args) or setter (if passed an arg) for
     the current file content.

     The setter form sets the content, dispatches a
     'wiki-content-replaced' event, and returns this object.
  */
  P.wikiContent = function f(){
    if(0===arguments.length){
      return f.get();
    }else{
      f.set(arguments[0] || '');
      this.dispatchEvent('wiki-content-replaced', this);
      return this;
    }
  };
  /* Default get/set impls for file content */
  P.wikiContent.get = function(){return P.e.taEditor.value};
  P.wikiContent.set = function(content){P.e.taEditor.value = content};

  /**
     For use when installing a custom editor widget. Pass it the
     getter and setter callbacks to fetch resp. set the content of the
     custom widget. They will be triggered via
     P.wikiContent(). Returns this object.
  */
  P.setContentMethods = function(getter, setter){
    this.wikiContent.get = getter;
    this.wikiContent.set = setter;
    return this;
  };

  /**
     Removes the default editor widget (and any dependent elements)
     from the DOM, adds the given element in its place, removes this
     method from this object, and returns this object.
  */
  P.replaceEditorElement = function(newEditor){
    P.e.taEditor.parentNode.insertBefore(newEditor, P.e.taEditor);
    P.e.taEditor.remove();
    P.e.selectFontSizeWrap.remove();
    delete this.replaceEditorElement;
    return P;
  };

  /**
     Sets the current page's base.href to {g.zTop}/wiki.
  */
  P.baseHrefForWiki = function f(){
    this.base.tag.href = this.base.wikiUrl;
    return this;
  };

  /**
     Sets the document's base.href value to its page-load-time
     setting.
  */
  P.baseHrefRestore = function(){
    this.base.tag.href = this.base.originalHref;
  };
  

  /**
     loadPage() loads the given wiki page and updates the relevant
     UI elements to reflect the loaded state. If passed no arguments
     then it re-uses the values from the currently-loaded page, reloading
     it (emitting an error message if no file is loaded).

     Returns this object, noting that the load is async. After loading
     it triggers a 'wiki-page-loaded' event, passing it this.winfo.

     If a locally-edited copy of the given file/rev is found, that
     copy is used instead of one fetched from the server, but it is
     still treated as a load event.

     Alternate call forms:

     - no arguments: re-loads from this.winfo.

     - 1 non-string argument: assumed to be an winfo-style
     object. Must have at least the {name} property, but need not have
     other winfo state.
  */
  P.loadPage = function(name){
    if(0===arguments.length){
      /* Reload from this.winfo */
      if(!affirmPageLoaded()) return this;
      name = this.winfo.name;
    }else if(1===arguments.length && 'string' !== typeof name){
      /* Assume winfo-like object */
      const arg = arguments[0];
      name = arg.name;
    }
    const onload = (r)=>this.dispatchEvent('wiki-page-loaded', r);
    const stashWinfo = this.getStashedWinfo({name: name});
    if(stashWinfo){ // fake a response from the stash...
      F.message("Fetched from the local-edit storage:",
                stashWinfo.name);
      onload({
        name: stashWinfo.name,
        mimetype: stashWinfo.mimetype,
        type: stashWinfo.type,
        version: stashWinfo.version,
        parent: stashWinfo.parent,
        content: $stash.stashedContent(stashWinfo)
      });
      return this;
    }
    F.message(
      "Loading content..."
    ).fetch('wikiajax/fetch',{
      urlParams: {
        page: name
      },
      responseType: 'json',
      onload:(r)=>{
        F.message('Loaded page ['+r.name+'].');
        onload(r);
      }
    });
    return this;
  };
  
  /**
     Fetches the page preview based on the contents and settings of
     this page's input fields, and updates the UI with with the
     preview.

     Returns this object, noting that the operation is async.
  */
  P.preview = function f(switchToTab){
    if(!affirmPageLoaded()) return this;
    const target = this.e.previewTarget,
          self = this;
    const updateView = function(c){
      D.clearElement(target);
      if('string'===typeof c) target.innerHTML = c;
      if(switchToTab) self.tabs.switchToTab(self.e.tabs.preview);
    };
    return this._postPreview(this.wikiContent(), updateView);
  };

  /**
     Callback for use with F.connectPagePreviewers()
  */
  P._postPreview = function(content,callback){
    if(!affirmPageLoaded()) return this;
    if(!content){
      callback(content);
      return this;
    }
    const fd = new FormData();
    const mimetype = this.e.selectMimetype.value;
    fd.append('page', this.winfo.name);
    fd.append('mimetype',mimetype);
    fd.append('content',content || '');
    F.message(
      "Fetching preview..."
    ).fetch('wikiajax/preview',{
      payload: fd,
      onload: (r,header)=>{
        callback(r);
        F.message('Updated preview.');
        P.previewNeedsUpdate = false;
        P.dispatchEvent('wiki-preview-updated',{
          mimetype: mimetype,
          element: P.e.previewTarget
        });
      },
      onerror: (e)=>{
        fossil.fetch.onerror(e);
        callback("Error fetching preview: "+e);
      }
    });
    return this;
  };

  /**
     Undo some of the SBS diff-rendering bits which hurt us more than
     they help...
  */
  P.tweakSbsDiffs2 = function(){
    if(1){
      const dt = this.e.diffTarget;
      dt.querySelectorAll('.sbsdiffcols .difftxtcol').forEach(
        (dtc)=>{
          const pre = dtc.querySelector('pre');
          pre.style.width = 'initial';
          //pre.removeAttribute('style');
          //console.debug("pre width =",pre.style.width);
        }
      );
    }
    this.tweakSbsDiffs();
  };

  /**
     Fetches the content diff based on the contents and settings of
     this page's input fields, and updates the UI with the diff view.

     Returns this object, noting that the operation is async.
  */
  P.diff = function f(sbs){
    if(!affirmPageLoaded()) return this;
    const content = this.wikiContent(),
          self = this,
          target = this.e.diffTarget;
    const fd = new FormData();
    fd.append('page',this.winfo.name);
    fd.append('sbs', sbs ? 1 : 0);
    fd.append('content',content);
    if(this.e.selectDiffWS) fd.append('ws',this.e.selectDiffWS.value);
    F.message(
      "Fetching diff..."
    ).fetch('wikiajax/diff',{
      payload: fd,
      onload: function(c){
        target.innerHTML = [
          "<div>Diff <code>[",
          self.winfo.name,
          "]</code> &rarr; Local Edits</div>",
          c||'No changes.'
        ].join('');
        if(sbs) P.tweakSbsDiffs2();
        F.message('Updated diff.');
        self.tabs.switchToTab(self.e.tabs.diff);
      }
    });
    return this;
  };

  /**
     Updates P.winfo for certain state and stashes P.winfo, with the
     current content fetched via P.wikiContent().

     If passed truthy AND the stash already has stashed content for
     the current page, only the stashed winfo record is updated, else
     both the winfo and content are updated.
  */
  P.stashContentChange = function(onlyWinfo){
    if(affirmPageLoaded(true)){
      const wi = this.winfo;
      wi.mimetype = P.e.selectMimetype.value;
      if(onlyWinfo && $stash.hasStashedContent(wi)){
        $stash.updateWinfo(wi);
      }else{
        $stash.updateWinfo(wi, P.wikiContent());
      }
      F.message("Stashed change(s) to page ["+wi.name+"].");
      P.updatePageTitle();
      $stash.prune();
      this.previewNeedsUpdate = true;
    }
    return this;
  };

  /**
     Removes any stashed state for the current P.winfo (if set) from
     F.storage. Returns this.
  */
  P.unstashContent = function(){
    const winfo = arguments[0] || this.winfo;
    if(winfo){
      this.previewNeedsUpdate = true;
      $stash.unstash(winfo);
      //console.debug("Unstashed",winfo);
      F.message("Unstashed page ["+winfo.name+"].");
    }
    return this;
  };

  /**
     Clears all stashed file state from F.storage. Returns this.
  */
  P.clearStash = function(){
    $stash.clear();
    return this;
  };

  /**
     If stashed content for P.winfo exists, it is returned, else
     undefined is returned.
  */
  P.contentFromStash = function(){
    return affirmPageLoaded(true) ? $stash.stashedContent(this.winfo) : undefined;
  };

  /**
     If a stashed version of the given winfo object exists (same
     filename/checkin values), return it, else return undefined.
  */
  P.getStashedWinfo = function(winfo){
    return $stash.getWinfo(winfo);
  };
  
})(window.fossil);