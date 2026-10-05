(function(){var g=window.__godo;if(!g){g=window.__godo={};try{g.want=!!(/[?&]app=1(&|$)/.test(location.search)||navigator.standalone===true||matchMedia('(display-mode: standalone)').matches||!!localStorage.getItem('sb-nplvkwwebmuhugwweywr-auth-token')||!!localStorage.getItem('godo.firstSeen')||sessionStorage.getItem('godo.app')==='1'||/(^|[?&#])(access_token|error_description)=/.test(location.search+location.hash))}catch(e){g.want=false}
var st=document.createElement('style');st.textContent="html:not(.js) body{overflow:auto;height:auto}html:not(.js) #root{display:block;height:auto}html:not(.js) .seo{height:auto;overflow:visible}.opening .seo{visibility:visible!important}";document.head.appendChild(st)}
var d=document.documentElement;if(g.run)return;g.run=1;
g.boot=function(opening){if(g.booted)return;g.booted=1;try{sessionStorage.setItem('godo.app','1');var q=location.search;if(/[?&]app=1(&|$)/.test(q))history.replaceState(history.state,'',location.pathname+q.replace(/([?&])app=1(&|$)/,'$1').replace(/[?&]$/,'')+location.hash)}catch(e){}
d.className=d.className.replace(/(^|\s)static(?=\s|$)/g,'')+(/(^|\s)js(\s|$)/.test(d.className)?'':' js')+(opening?' opening':'');
var add=function(){var s=document.createElement('script');s.src='/_expo/static/js/web/entry-bed383e78a5595eeecb72a80f156bbd8.js';s.async=false;document.head.appendChild(s)};
if(document.readyState==='loading'){var l=document.createElement('link');l.rel='preload';l.as='script';l.href='/_expo/static/js/web/entry-bed383e78a5595eeecb72a80f156bbd8.js';document.head.appendChild(l);document.addEventListener('DOMContentLoaded',add)}else add()};
if(g.want){g.boot();return}
d.className=d.className.replace(/(^|\s)js(?=\s|$)/g,'')+(/(^|\s)static(\s|$)/.test(d.className)?'':' static');
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[data-app],a.cta'):null;
if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
var u=new URL(a.href,location.href);if(u.origin!==location.origin||u.pathname.replace(/\/$/,'')!==location.pathname.replace(/\/$/,''))return;
e.preventDefault();a.textContent='Opening Go Do…';var y=window.scrollY;g.boot(true);var p=document.querySelector('.seo');if(p)p.scrollTop=y});})();
