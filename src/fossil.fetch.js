"use strict";
/**
   Requires that window.fossil has already been set up.

   window.fossil.fetch() is an HTTP request/response mini-framework
   similar (but not identical) to the not-quite-ubiquitous
   window.fetch().

   JS usages:

   fossil.fetch( URI [, onLoadCallback] );

   fossil.fetch( URI [, optionsObject = {}] );

   Noting that URI must be relative to the top of the repository and
   should not start with a slash (if it does, it is stripped). It gets
   the equivalent of "%R/" prepended to it.

   The optionsObject may be an onload callback or an object with any
   of these properties:

   - onload: callback(responseData) (default = output response to the
   console). In the context of the callback, the options object is
   "this", noting that this call may have amended the options object
   with state other than what the caller provided.

   - onerror: callback(XHR onload event | exception) (default = event
   or exception to the console). Triggered if the request generates
   any response other than HTTP 200. In the context of the callback,
   the options object is "this".

   - method: 'POST' | 'GET' (default = 'GET'). CASE SENSITIVE!

   - payload: anything acceptable by XHR2.send(ARG) (DOMString,
   Document, FormData, Blob, File, ArrayBuffer), or a plain object or
   array, either of which gets JSON.stringify()'d. If payload is set
   then the method is automatically set to 'POST'. By default XHR2
   will set the content type based on the payload type. If an
   object/array is converted to JSON, the contentType option is
   automatically set to 'application/json', and if JSON.stringify() of
   that value fails then the exception is propagated to this
   function's caller.

   - contentType: Optional request content type when POSTing. Ignored
   if the method is not 'POST'.

   - responseType: optional string. One of ("text", "arraybuffer",
   "blob", or "document") (as specified by XHR2). Default = "text".
   As an extension, it supports "json", which tells it that the
   response is expected to be text and that it should be JSON.parse()d
   before passing it on to the onload() callback. If parsing of such
   an object fails, the onload callback is not called, and the
   onerror() callback is passed the exception from the parsing error.

   - urlParams: string|object. If a string, it is assumed to be a
   URI-encoded list of params in the form "key1=val1&key2=val2...",
   with NO leading '?'.  If it is an object, all of its properties get
   converted to that form. Either way, the parameters get appended to
   the URL before submitting the request.

   - responseHeaders: If true, the onload() callback is passed an
   additional argument: a map of all of the response headers. If it's
   a string value, the 2nd argument passed to onload() is instead the
   value of that single header. If it's an array, it's treated as a
   list of headers to return, and the 2nd argument is a map of those
   header values. When a map is passed on, all of its keys are
   lower-cased. When a given header is requested and that header is
   set multiple times, their values are (per the XHR docs)
   concatenated together with ", " between them.

   - beforesend/aftersend: optional callbacks which are called without
   arguments immediately before the request is submitted and
   immediately after it is received, regardless of success or
   error. In the context of the callback, the options object is the
   "this". These can be used to, e.g., keep track of in-flight
   requests and update the UI accordingly, e.g. disabling/enabling DOM
   elements. Any exceptions triggered by beforesend/aftersend are
   caught and silently ignored.

   When an options object does not provide
   onload/onerror/beforesend/aftersend handlers of its own, this
   function falls to defaults which are member properties of this
   function with the same name, e.g. fossil.fetch.onload(). The
   default onload/onerror implementations route the data through the
   dev console and (for onerror()) through fossil.error(). The default
   beforesend/aftersend are no-ops. Individual pages may overwrite
   those members to provide default implementations suitable for the
   page's use, e.g. keeping track of how many in-flight

   Returns this object, noting that the XHR request is asynchronous,
   and still in transit (or has yet to be sent) when that happens.
*/
window.fossil.fetch = function f(uri,opt){
  const F = fossil;
  if(!f.onload){
    f.onload = (r)=>console.debug('ajax response:',r);
  }
  if(!f.onerror){
    f.onerror = function(e/*event or exception*/){
      console.error("Ajax error:",e);
      if(e instanceof Error){
        F.error('Exception:',e);
      }
      else if(e.originalTarget && e.originalTarget.responseType==='text'){
        const txt = e.originalTarget.responseText;
        try{
          /* The convention from the /filepage_xyz routes is to
             return error responses in JSON form if possible:
             {error: "..."}
          */
          const j = JSON.parse(txt);
          console.error("Error JSON:",j);
          if(j.error){ F.error(j.error) };
        }catch(e){/* Try harder */
          F.error(txt)
        }
      }
    };
  }/*f.onerror()*/
  if(!f.parseResponseHeaders){
    f.parseResponseHeaders = function(h){
      const rc = {};
      if(!h) return rc;
      const ar = h.trim().split(/[\r\n]+/);
      ar.forEach(function(line) {
        const parts = line.split(': ');
        const header = parts.shift();
        const value = parts.join(': ');
        rc[header.toLowerCase()] = value;
      });
      return rc;
    };
  }
  if('/'===uri[0]) uri = uri.substr(1);
  if(!opt) opt = {};
  else if('function'===typeof opt) opt={onload:opt};
  if(!opt.onload) opt.onload = f.onload;
  if(!opt.onerror) opt.onerror = f.onerror;
  if(!opt.beforesend) opt.beforesend = f.beforesend;
  if(!opt.aftersend) opt.aftersend = f.aftersend;
  let payload = opt.payload, jsonResponse = false;
  if(undefined!==payload){
    opt.method = 'POST';
    if(!(payload instanceof FormData)
       && !(payload instanceof Document)
       && !(payload instanceof Blob)
       && !(payload instanceof File)
       && !(payload instanceof ArrayBuffer)
       && ('object'===typeof payload
           || payload instanceof Array)){
      payload = JSON.stringify(payload);
      opt.contentType = 'application/json';
    }
  }
  const url=[F.repoUrl(uri,opt.urlParams)],
        x=new XMLHttpRequest();
  if('POST'===opt.method && 'string'===typeof opt.contentType){
    x.setRequestHeader('Content-Type',opt.contentType);
  }
  x.open(opt.method||'GET', url.join(''), true);
  if('json'===opt.responseType){
    /* 'json' is an extension to the supported XHR.responseType
       list. We use it as a flag to tell us to JSON.parse()
       the response. */
    jsonResponse = true;
    x.responseType = 'text';
  }else{
    x.responseType = opt.responseType||'text';
  }
  x.onload = function(e){
    try{opt.aftersend()}catch(e){/*ignore*/}
    if(200!==this.status){
      opt.onerror(e);
      return;
    }
    const orh = opt.responseHeaders;
    let head;
    if(true===orh){
      head = f.parseResponseHeaders(this.getAllResponseHeaders());
    }else if('string'===typeof orh){
      head = this.getResponseHeader(orh);
    }else if(orh instanceof Array){
      head = {};
      orh.forEach((s)=>{
        if('string' === typeof s) head[s.toLowerCase()] = x.getResponseHeader(s);
      });
    }
    try{
      const args = [(jsonResponse && this.response)
                    ? JSON.parse(this.response) : this.response];
      if(head) args.push(head);
      opt.onload.apply(opt, args);
    }catch(e){
      opt.onerror(e);
    }
  };
  try{opt.beforesend()}catch(e){/*ignore*/}
  if(undefined!==payload) x.send(payload);
  else x.send();
  return this;
};

window.fossil.fetch.beforesend = function(){};
window.fossil.fetch.aftersend = function(){};