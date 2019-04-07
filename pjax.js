/**
 * Helper utilities
 */

// Collect form data and return it
function collectFormData(form) {
    var data = new FormData(form);
    
    // Multi language fields
    var temp_fields = [];
    form.querySelectorAll('div.multi-language-input input[id], textarea[id]').forEach(elem => {
        var data = window[elem.getAttribute('id').split('_').slice(0, -1).join('_') + '_data'];
        
        var name = elem.getAttribute('data-name').split('_').shift();
        var prop = elem.getAttribute('data-name').split('_').pop();
        
        for(var language in data) {
            var localized_name = name + '[' + language + '][' + prop + ']';
            
            temp_fields.push(localized_name);
            
            var input = document.createElement('input');
            input.setAttribute('type', 'hidden');
            input.setAttribute('name', localized_name);
            input.value = data[language][prop].toString();
            form.appendChild(input);
        }
    });
    
    // remove temporary fields
    temp_fields.forEach(temp_field => {
        var field = form.querySelector('input[type="hidden"][name="' + temp_field + '"]');
        field.parentNode.removeChild(field);
    });
    
    // file uploads
    var files = {}
    form.querySelectorAll('input[type="file"]').forEach(input => {
        var prop = input.getAttribute('name');
        
        if(!input.multiple === true) {
            files[prop] = elem.files[0];
        } else {
            prop += '[]';
            for(var i = 0; i < elem.files.length; i++) {
                files[prop] = elem.files[i];
            }
        }
    });
    
    for(var key in files) {
        data.append(key, files[key]);
    }
    
    return data;
}

// Element's offset determination
function getOffset(elem) {
    let rect = elem.getBoundingClientRect();
    let win = elem.ownerDocument.defaultView;
    
    return {
        top: rect.top + win.pageYOffset,
        left: rect.left + win.pageXOffset
    };
}

// Converts HTML string to element object
function htmlToObject(html) {
    if(typeof html !== 'string') return html;
    
    let wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    return wrapper.firstChild;
}

// Scroll animation
function scrollToPosition(position) {
    var  scrollStep = -position / (500 / 15),
    
    scrollInterval = setInterval(function() {
        if ( window.scrollY != 0 ) {
            window.scrollBy( 0, scrollStep );
        } else clearInterval(scrollInterval); 
    }, 15);
}


/**
 * PJAX
 *
 * Loads a URL with fetch, puts the response body inside a container,
 * then pushState()'s the loaded URL.
 *
 * Based on jQuery-pjax
 * Copyright 2012, Chris Wanstrath
 *
 * @copyright   2019 Nimdox B.V.
 * @license     MIT
 */

var cacheMapping      = {};
var cacheForwardStack = [];
var cacheBackStack    = [];

var initialPop = true;
const initialURL = window.location.href;
const initialState = window.history.state;

export class Pjax {
    static defaults = {
        timeout: 650,
        push: true,
        replace: false,
        method: 'get',
        responseType: 'text',
        scrollTo: 0,
        maxCacheLength: 20
    }
    state = null;
    
    constructor() {
        // Initialize pjax.state if possible
        if(initialState && initialState.container) {
            this.state = initialState;
        }

        // Non-webkit browsers don't fire an initial popstate event
        if('state' in window.history)
            initialPop = false;
        
        // Add default version identifier
        Pjax.defaults.version = this.findVersion;
    }
    
    // 
    call = (options) => {
        if(!this.supported())
            return this.fallback(options);
        
        this.options = {...Pjax.defaults, ...options};
        
        if(typeof this.options.url === 'function')
            this.options.url = this.options.url();
            
        this.cancelToken = axios.CancelToken.source();
        this.hash = this._parseURL(this.options.url).hash;
        
        let containerType = typeof this.options.container;
        if(containerType !== 'string')
            throw "expected string value for 'container' option; got " + containerType;
        
        this.context = this.options.context = document.querySelector(this.options.container);
        if(!this.context)
            throw "the container selector '" + this.options.container + "' did not match anything";
        
        // Maintain two separate internal caches: one for  for pjax'd
        // partial page loads and one for normal page loads.
        if(!this.options.data) this.options.data = {};
        if(Array.isArray(this.options.data))
            this.options.data.push({name: '_pjax', value: this.options.container});
        else
            this.options.data._pjax = this.options.container;
                
        // Initialize pjax.state for the initial page load. Assume we're
        // using the container and options of the link we're loading for the
        // back button to the initial page. This ensures good back button
        // behavior.
        if(!this.state) {
            this.state = {
                id: this._uniqueId(),
                url: window.location.href,
                title: document.title,
                container: this.options.container,
                fragment: this.options.fragment,
                timeout: this.options.timeout
            };
            
            window.history.replaceState(this.state, document.title);
        }
        
        pjax.options = this.options;
        
        const instance = axios.create();
        
        this.beforeSend(instance, this.options);
        
        this.fire('pjax:start', [this.options]);
        this.fire('pjax:send', [this.options]);
        
        instance({...this.options, ...{'cancelToken': this.cancelToken.token}}).then(response => {
            pjax.response = response;
            
            if(this.options.push && !this.options.replace) {
                // Cache current container element before replacing it
                this._cachePush(this.state.id, [this.options.container, this._cloneContents(this.context)]);
                
                window.history.pushState(null, '', this.options.requestUrl);
            }
            
            this.onSuccess(response.data, response.status, response);
            this.onComplete(response, response.statusText);
        }).catch(error => {
            this.onError(error.response || null, error.response ? error.response.statusText : error.message, error);
            this.onComplete(response || null, response.statusText ? error.response.statusText : error.message);
        });
        
        return pjax.response
    }
    
    // pjax on click handler
    click = (event, container, options) => {
        options = this._optionsFor(container, options);

        let link = event.currentTarget;

        if(link.tagName.toUpperCase() !== 'A')
            throw 'pjax.click requires an anchor element';
        
        // Middle click, cmd click, and ctrl click should open
        // links in a new tab as normal.
        if(event.which > 1 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
        
        // Ignore cross origin links
        if(location.protocol !== link.protocol || location.hostname !== link.hostname)
            return;
        
        // Ignore case when a hash is being tacked on the current URL
        if(link.href.indexOf('#') > -1 && this._stripHash(link) == this._stripHash(location))
            return;
        
        // Ignore event with default prevented
        if(event.defaultPrevented)
            return;
        
        // options
        let defaults = {
            url: link.href,
            container: link.getAttribute('data-pjax'),
            target: link
        };
        
        // call
        let opts = {...defaults, ...options};
        let clickEvent = new CustomEvent('pjax:click', {detail: [opts]});
        
        if(link.dispatchEvent(clickEvent)) {
            this.call(opts);
            event.preventDefault();
            
            var event = new CustomEvent(eventType, {
                bubbles: true,
                detail: data
            });
            
            let clickedEvent = new CustomEvent('pjax:clicked', {detail: [opts]});
            link.dispatchEvent(clickedEvent);
        };
    }
    
    // pjax on form submit handler
    submit = (event, container, options) => {
        options = this._optionsFor(container, options);
        
        let form = event.currentTarget;
        
        if(form.tagName.toUpperCase() !== 'FORM')
            throw 'pjax.submit requires a form element';
        
        // options
        let defaults = {
            method: (form.getAttribute('method') || 'GET').toLowerCase(),
            url: form.getAttribute('action'),
            container: form.getAttribute('data-pjax'),
            target: form
        };
        
        // collect data
        defaults.data = collectFormData(form);
        
        // call
        this.call({...defaults, ...options});

        event.preventDefault();
    }
    
    // Public: Reload current page with pjax.
    reload = (container, options) => {
        if(!this.supported())
            window.location.reload();
        
        let defaults = {
            url: window.location.href,
            push: false,
            replace: true,
            scrollTo: false
        };
        
        return this.call({...defaults, ...this._optionsFor(container, options)});
    }
    
    // Event trigger
    fire = (type, args, props={}) => {
        props.bubbles = true;
        props.detail = args;
        
        let event = new CustomEvent(type, props);
        Object.defineProperty(event, 'relatedTarget', {value: this.options.target, enumerable: true});
        return this.context.dispatchEvent(event);
    }
    
    // beforeSend callback
    beforeSend = (client, settings) => {
        // No timeout for non-GET requests
        // Its not safe to request the resource again with a fallback method.
        if(settings.method !== 'get')
            settings.timeout = 0;
        
        client.defaults.headers.common['X-PJAX'] = 'true';
        client.defaults.headers.common['X-PJAX-Container'] = this.options.container;
        
        if(!this.fire('pjax:beforeSend', [client, settings]))
            return false;
        
        if(settings.timeout > 0) {
            this.timeoutTimer = setTimeout(() => {
                if(this.fire('pjax:timeout', [client, this.options]))
                    this.cancelToken.cancel('timeout');
            }, settings.timeout);
            
            // Clear timeout setting so jquerys internal timeout isn't invoked
            settings.timeout = 0;
        }
        
        let url = this._parseURL(settings.url);
        if(this.hash) url.hash = this.hash;
        this.options.requestUrl = this._stripInternalParams(url);
    }
    
    // complete callback
    onComplete = (response, textStatus) => {
        if(this.timeoutTimer)
            clearTimeout(this.timeoutTimer);
        
        this.fire('pjax:complete', [response, textStatus, this.options]);
        this.fire('pjax:end', [response, this.options]);
    }
    
    // error callback
    onError = (response, textStatus, errorThrown) => {
        let allowed = this.fire('pjax:error', [response, textStatus, errorThrown, this.options])
        
        if(axios.isCancel(errorThrown)) {
            window.location.reload();
        } else if(this.options.method === 'get' && textStatus !== 'abort' && allowed) {
            let container = this._extractContainer('', response, this.options);
            this._locationReplace(container.url)
        }
    }
    
    // success callback
    onSuccess = (data, status, response) => {
        let previousState = this.state;
        
        // If pjax.defaults.version is a function, invoke it first.
        // Otherwise it can be a static string.
        let currentVersion = typeof this.options.version === 'function' ?
            this.options.version() :
            this.findVersion;
        
        let latestVersion = response.headers['x-pjax-version'] || null;
        
        let container = this._extractContainer(data, response, this.options);
        
        let url = this._parseURL(container.url);
        if(this.hash) {
            url.hash = this.hash;
            container.url = url.href;
        }
        
        // If there is a layout version mismatch, hard load the new url
        if(currentVersion && latestVersion && currentVersion !== latestVersion) {
            this._locationReplace(container.url);
            return;
        }
        
        // If the new response is missing a body, hard load the page
        if(!container.contents) {
            this._locationReplace(container.url);
            return;
        }
        
        this.state = {
            id: this.options.id || this._uniqueId(),
            url: container.url,
            title: container.title,
            container: this.options.container,
            fragment: this.options.fragment,
            timeout: this.options.timeout
        };
        
        if(this.options.push || this.options.replace) {
            window.history.replaceState(this.state, container.title, container.url);
        }
        
        // Only blur the focus if the focused element is within the container.
        let blurFocus = document.activeElement.contains(this.context);
        
        // Clear out any focused controls before inserting new page contents.
        if(blurFocus) {
            try {
                document.activeElement.blur();
            } catch (e) { /* ignore */ }
        }
        
        if(container.title)
            document.title = container.title;
        
        this.fire('pjax:beforeReplace', [container.contents, this.options], {
            state: this.state,
            previousState: previousState
        });
        
        
        this.context.innerHTML = container.contents.innerHTML;
        
        // FF bug: Won't autofocus fields that are inserted via JS.
        var autofocusEl = Array.from(this.context.querySelectorAll('input[autofocus], textarea[autofocus]')).shift();
        if(autofocusEl && document.activeElement !== autofocusEl) {
            autofocusEl.focus();
        }
        
        this._executeScriptTags(container.scripts);
        
        let scrollTo = this.options.scrollTo;
        
        // Ensure browser scrolls to the element referenced by the URL anchor
        if(this.hash) {
            let name = decodeURIComponent(this.hash.slice(1));
            let target = document.getElementById(name) || document.getElementsByName(name)[0];
            if(target) scrollTo = getOffset(target).top;
        }
        
        if(typeof scrollTo == 'number')
            scrollToPosition(scrollTo);
        
        this.fire('pjax:success', [data, status, response, this.options]);
    }
    
    // Is pjax supported by this browser?
    supported() {
        return window.history && window.history.pushState && window.history.replaceState &&
               !navigator.userAgent.match(/((iPod|iPhone|iPad).+\bOS\s+[1-4]\D|WebApps\/.+CFNetwork)/);
    }
    
    // popstate handler takes care of the back and forward buttons
    onPjaxPopstate = (event) => {
        // Hitting back or forward should override any pending PJAX request.
        let previousState = this.state;
        let state = event.state;
        
        if(state && state.container) {
            // When coming forward from a separate history session, will get an
            // initial pop with a state we are already at. Skip reloading the current
            // page.
            if(initialPop && initialURL == state.url) return;
            
            if(previousState) {
                // If popping back to the same state, just skip.
                // Could be clicking back from hashchange rather than a pushState.
                if(previousState.id === state.id) return;
                
                // Since state IDs always increase, we can deduce the navigation direction
                var direction = previousState.id < state.id ? 'forward' : 'back';
            }
            
            let cache = cacheMapping[state.id] || [];
            let containerSelector = cache[0] || state.container;
            let container = document.querySelector(containerSelector);
            let contents = cache[1];
            
            if(container) {
                if(previousState) {
                    // Cache current container before replacement and inform the
                    // cache which direction the history shifted.
                    this._cachePop(direction, previousState.id, [containerSelector, this._cloneContents(container)]);
                }
                
                let popstateEvent = new CustomEvent('pjax:popstate', {
                    state: state,
                    direction: direction
                });
                container.dispatchEvent(popstateEvent);
                
                let options = {
                    id: state.id,
                    url: state.url,
                    container: containerSelector,
                    push: false,
                    fragment: state.fragment,
                    timeout: state.timeout,
                    scrollTo: false
                };
                
                if(contents) {
                    let startEvent = new CustomEvent('pjax:start', {detail: [null, options]});
                    container.dispatchEvent(startEvent);
                    
                    this.state = state;
                    if(state.title) document.title = state.title;
        
                    var beforeReplaceEvent = new CustomEvent('pjax:beforeReplace', {
                        bubbles: true,
                        detail: [contents, options],
                        state: state,
                        previousState: previousState
                    });
                    container.dispatchEvent(beforeReplaceEvent);
                    container.innerHTML = contents.innerHTML;
                    
                    let endEvent = new CustomEvent('pjax:end', {detail: [null, options]});
                    container.dispatchEvent(endEvent);
                } else {
                    this._locationReplace(location.href);
                }
            } else {
                this._locationReplace(location.href);
            }
            
            // Force reflow/relayout before the browser tries to restore the
            // scroll position.
            container.offsetHeight; // eslint-disable-line no-unused-expressions
        }
        
        initialPop = false;
    }
    
    // Fallback version of main pjax function for browsers that don't
    fallback = (options) => {
        let url = typeof options.url === 'function' ? options.url() : options.url,
            method = options.type ? options.type.toUpperCase() : 'GET';
        
        let form = document.createElement('form');
        form.setAttribute('method', method === 'GET' ? 'GET' : 'POST');
        form.setAttribute('action', url);
        form.style.setProperty('display', 'none');
        
        if(method !== 'GET' && method !== 'POST') {
            let input = document.createElement('input');
            input.setAttribute('type', 'hidden');
            input.setAttribute('name', '_method');
            input.value = method.toLowerCase();
            form.appendChild(input);
        }
        
        let data = options.data;
        if(typeof data === 'string') {
            data.split('&').forEach(value => {
                var pair = value.split('=');
                
                var input = document.createElement('input');
                input.setAttribute('type', 'hidden');
                input.setAttribute('name', pair[0]);
                input.value = pair[1];
                form.appendChild(input);
            });
        } else if(Array.isArray(data)) {
            data.forEach(value => {
                var input = document.createElement('input');
                input.setAttribute('type', 'hidden');
                input.setAttribute('name', value.name);
                input.value = value.value;
                form.appendChild(input);
            });
        } else if(typeof data === 'object') {
            for (var key in data) {
                var input = document.createElement('input');
                input.setAttribute('type', 'hidden');
                input.setAttribute('name', key);
                input.value = data[key];
                form.appendChild(input);
            }
        }
        
        document.body.appendChild(form);
        form.submit();
    }
    
    // Hard replace current state with url.
    _locationReplace = (url) => {
        window.history.replaceState(null, '', this.state.url);
        window.location.replace(url);
    }
    
    // Generate unique id for state object.
    _uniqueId = () => {
        return (new Date).getTime();
    }
    
    // Clone container
    _cloneContents = (container) => {
        return container.cloneNode(true);
    }
    
    // Strip internal query params from parsed URL.
    _stripInternalParams = (url) => {
        url.search = url.search.replace(/([?&])(_pjax|_)=[^&]*/g, '').replace(/^&/, '');
        return url.href.replace(/\?($|#)/, '$1');
    }
    
    // Parse URL components and returns a Locationish object.
    _parseURL = (url) => {
        var a = document.createElement('a');
        a.href = url;
        
        return a;
    }
    
    // Return the `href` component of given URL object with the hash
    _stripHash = (location) => {
        return location.href.replace(/#.*/, '');
    }
    
    // Build options Object for arguments.
    _optionsFor = (container, options) => {
        if(container && options) {
            options = {...{}, ...options};
            options.container = container;
            return options
        } else if(Object.prototype.toString.call(container) === '[object Object]') {
            return container
        } else {
            return {container: container}
        }
    }
    
    // Parses HTML string into objects
    _parseHTML = (html) => {
        let tmp = document.implementation.createHTMLDocument();
        tmp.body.innerHTML = html;
        
        return tmp.body.children;
    }
    
    // Extracts container and metadata from response.
    _extractContainer = (data, response, options) => {
        var obj = {},
            fullDocument = /<html/i.test(data);
        
        // Prefer X-PJAX-URL header if it was set, otherwise fallback to
        // using the original requested url.
        var serverUrl = response.headers['x-pjax-url'];
        obj.url = serverUrl ? this._stripInternalParams(this._parseURL(serverUrl)) : options.requestUrl;
        
        var head, body;
        // Attempt to parse response html into elements
        if(fullDocument) {
            body = this._parseHTML(data.match(/<body[^>]*>([\s\S.]*)<\/body>/i)[0]);
            head = data.match(/<head[^>]*>([\s\S.]*)<\/head>/i);
            head = head != null ? this._parseHTML(head[0]) : body;
        } else {
            let wrapper = document.createElement('div');
            wrapper.innerHTML = data.trim();
            head = body = wrapper;
        }
        
        // If response data is empty, return fast
        if(body.length === 0)
            return obj;
        
        // If there's a <title> tag in the header, use it as
        // the page's title.
        obj.title = head.querySelector('title') ? Array.from(head.querySelectorAll('title')).pop().innerHTML : null;
        
        if(options.fragment) {
            let fragment = body;
            
            // If they specified a fragment, look for it in the response
            // and pull it out.
            if(options.fragment !== 'body') {
                fragment = fragment.querySelector(options.fragment);
            }
            
            if(!fragment) {
                obj.contents = options.fragment === 'body' ? fragment : htmlToObject(fragment.innerHTML);
                
                // If there's no title, look for data-title and title attributes
                // on the fragment
                if(!obj.title)
                    obj.title = fragment.getAttribute('title') || fragment.getAttribute('data-title');
            }
        } else if(!fullDocument) {
            obj.contents = body;
        }
        
        // Clean up any <title> tags
        if(obj.contents) {
            // Remove any parent title elements
            obj.contents.querySelectorAll('title').forEach(el => {
                el.parentNode.removeChild(el);
            });
            
            // Gather all script[src] elements
            obj.scrips = obj.contents.querySelectorAll('script[src]');
            obj.contents.querySelectorAll('script[src]').forEach(el => {
                el.parentNode.removeChild(el);
            });
        }
        
        // Trim any whitespace off the title
        if(obj.title) obj.title = obj.title.trim();
        
        return obj
    }
    
    // Load an execute scripts using standard script request.
    _executeScriptTags = (scripts) => {
        if(!scripts) return
        
        scripts.forEach(script => {
            let src = script.getAttribute('src');
            if(document.querySelector('script[src="' + src + '"]'))
                return;
            
            let tag = document.createElement('script');
            let type = script.getAttribute('type');
            if(type) tag.type = type;
            tag.src = script.getAttribute('src');
            document.head.appendChild(tag);
        });
    }
    
    // Push previous state id and container contents into the history
    // cache. Should be called in conjunction with `pushState` to save the
    // previous container contents.
    _cachePush = (id, value) => {
        cacheMapping[id] = value;
        cacheBackStack.push(id);
        
        // Remove all entries in forward history stack after pushing a new page.
        this._trimCacheStack(cacheForwardStack, 0);
        
        // Trim back history stack to max cache length.
        this._trimCacheStack(cacheBackStack, Pjax.defaults.maxCacheLength);
    }
    
    // Shifts cache from directional history cache. Should be
    // called on `popstate` with the previous state id and container
    // contents.
    _cachePop = (direction, id, value) => {
        let pushStack,
            popStack;
        cacheMapping[id] = value;
        
        if(direction === 'forward') {
            pushStack = cacheBackStack;
            popStack  = cacheForwardStack;
        } else {
            pushStack = cacheForwardStack;
            popStack  = cacheBackStack;
        }
        
        pushStack.push(id);
        id = popStack.pop();
        if(id) delete cacheMapping[id];
        
        // Trim whichever stack we just pushed to to max cache length.
        this._trimCacheStack(pushStack, Pjax.defaults.maxCacheLength);
    }
    
    // Trim a cache stack (either cacheBackStack or cacheForwardStack) to be no
    // longer than the specified length, deleting cached DOM elements as necessary.
    _trimCacheStack = (stack, length) => {
        while (stack.length > length)
            delete cacheMapping[stack.shift()];
    }
    
    // Find version identifier for the initial page load.
    findVersion = () => {
        let meta = [...document.querySelectorAll('meta')].filter(m => {
            let name = m.getAttribute('http-equiv');
            return name && name.toUpperCase() === 'X-PJAX-VERSION';
        });
        
        if(meta.length)
            return meta[0].getAttribute('content');
        return null;
    }
}


var pjax = new Pjax();
window.addEventListener('popstate', pjax.onPjaxPopstate);

export default pjax;