# pjax = pushState + ajax

This is a vanilla version of the popular [PJAX plugin for jQuery](http://github.com/defunkt/jquery-pjax) by Chris Wanstrath.

## Installation

pjax depends [axios](https://github.com/axios/axios) for making HTTP requests.

## Usage

### Server-side configuration

Ideally, your server should detect pjax requests by looking at the special
`X-PJAX` HTTP header, and render only the HTML meant to replace the contents of
the container element (`#pjax-container` in our example) without the rest of
the page layout.

### pjax options

key | default | description
----|---------|------------
`timeout` | 650 | ajax timeout in milliseconds after which a full refresh is forced
`push` | true | use [pushState][] to add a browser history entry upon navigation
`replace` | false | replace URL without adding browser history entry
`maxCacheLength` | 20 | maximum cache size for previous container contents
`version` | | a string or function returning the current pjax version
`scrollTo` | 0 | vertical position to scroll to after navigation. To avoid changing scroll position, pass `false`.
`type` | `"GET"` | see [axios](https://github.com/axios/axios)
`container` | | CSS selector for the element where content should be replaced
`url` | link.href | a string or function that returns the URL for the ajax request
`target` | link | eventually the `relatedTarget` value for [pjax events](#events)
`fragment` | | CSS selector for the fragment to extract from ajax response

You can change the defaults globally by writing to the `pjax.defaults` object:

``` javascript
pjax.defaults.timeout = 1200
```

### `pjax.click`

This example uses the current click context to set an ancestor element as the container:

``` javascript
if (pjax.supported()) {
  document.querySelectorAll('a[data-pjax]').forEach(link => {
    link.addEventListener('click', e => {
      var container = e.currentTarget.closest('[data-pjax-container]');
      var containerSelector = '#' + container.id;
      
      pjax.lick(e, {container: containerSelector});
    });
  });
}
```

### `pjax.submit`

Submits a form via pjax.

``` javascript
document.querySelectorAll('form[data-pjax]').forEach(form => {
  form.addEventListener('submit', e => {
    pjax.submit(e, 'pjax-container');
  });
});
```

### `pjax.reload`

Initiates a request for the current URL to the server using pjax mechanism and replaces the container with the response. Does not add a browser history entry.

``` javascript
pjax.reload('#pjax-container', options)
```

### `pjax`

Manual pjax invocation. Used mainly when you want to start a pjax request in a handler that didn't originate from a click. If you can get access to a click `event`, consider `pjax.click(event)` instead.

``` javascript
function applyFilters() {
  var url = urlForFilters()
  pjax({url: url, container: '#pjax-container'})
}
```

## Events

All pjax events except `pjax:click` & `pjax:clicked` are fired from the pjax
container element.

<table>
<tr>
  <th>event</th>
  <th>cancel</th>
  <th>arguments</th>
  <th>notes</th>
</tr>
<tr>
  <th colspan=4>event lifecycle upon following a pjaxed link</th>
</tr>
<tr>
  <td><code>pjax:click</code></td>
  <td>✔︎</td>
  <td><code>options</code></td>
  <td>fires from a link that got activated; cancel to prevent pjax</td>
</tr>
<tr>
  <td><code>pjax:beforeSend</code></td>
  <td>✔︎</td>
  <td><code>axios, options</code></td>
  <td>can set XHR headers</td>
</tr>
<tr>
  <td><code>pjax:start</code></td>
  <td></td>
  <td><code>options</code></td>
  <td></td>
</tr>
<tr>
  <td><code>pjax:send</code></td>
  <td></td>
  <td><code>options</code></td>
  <td></td>
</tr>
<tr>
  <td><code>pjax:clicked</code></td>
  <td></td>
  <td><code>options</code></td>
  <td>fires after pjax has started from a link that got clicked</td>
</tr>
<tr>
  <td><code>pjax:beforeReplace</code></td>
  <td></td>
  <td><code>contents, options</code></td>
  <td>before replacing HTML with content loaded from the server</td>
</tr>
<tr>
  <td><code>pjax:success</code></td>
  <td></td>
  <td><code>data, status, response, options</code></td>
  <td>after replacing HTML content loaded from the server</td>
</tr>
<tr>
  <td><code>pjax:timeout</code></td>
  <td>✔︎</td>
  <td><code>axios, options</code></td>
  <td>fires after <code>options.timeout</code>; will hard refresh unless canceled</td>
</tr>
<tr>
  <td><code>pjax:error</code></td>
  <td>✔︎</td>
  <td><code>response, textStatus, error, options</code></td>
  <td>on ajax error; will hard refresh unless canceled</td>
</tr>
<tr>
  <td><code>pjax:complete</code></td>
  <td></td>
  <td><code>response, textStatus, options</code></td>
  <td>always fires after ajax, regardless of result</td>
</tr>
<tr>
  <td><code>pjax:end</code></td>
  <td></td>
  <td><code>response, options</code></td>
  <td></td>
</tr>
<tr>
  <th colspan=4>event lifecycle on browser Back/Forward navigation</th>
</tr>
<tr>
  <td><code>pjax:popstate</code></td>
  <td></td>
  <td></td>
  <td>event <code>direction</code> property: &quot;back&quot;/&quot;forward&quot;</td>
</tr>
<tr>
  <td><code>pjax:start</code></td>
  <td></td>
  <td><code>null, options</code></td>
  <td>before replacing content</td>
</tr>
<tr>
  <td><code>pjax:beforeReplace</code></td>
  <td></td>
  <td><code>contents, options</code></td>
  <td>right before replacing HTML with content from cache</td>
</tr>
<tr>
  <td><code>pjax:end</code></td>
  <td></td>
  <td><code>null, options</code></td>
  <td>after replacing content</td>
</tr>
</table>

`pjax:send` & `pjax:complete` are a good pair of events to use if you are implementing a
loading indicator. They'll only be triggered if an actual XHR request is made,
not if the content is loaded from cache:

``` javascript
document.addEventListener('pjax:send', () => {
  document.getElementById('loading').style.display = 'block';
});
document.addEventListener('pjax:complete', () => {
  document.getElementById('loading').style.display = 'none';
});
```

An example of canceling a `pjax:timeout` event would be to disable the fallback
timeout behavior if a spinner is being shown:

``` javascript
document.addEventListener('pjax:timeout', e => {
  // Prevent default timeout redirection behavior
  e.preventDefault()
})
```