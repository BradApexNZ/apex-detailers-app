function installMobileMenu(){
  const shell=document.querySelector('.shell');
  const mobile=document.querySelector('.mobile');
  const aside=document.querySelector('.shell>aside');
  if(!shell||!mobile||!aside||mobile.querySelector('[data-v6-more]'))return;
  const more=document.createElement('button');
  more.type='button';
  more.dataset.v6More='true';
  more.innerHTML='<i>+</i><small>More</small>';
  more.addEventListener('click',()=>shell.classList.toggle('show-mobile-menu'));
  mobile.appendChild(more);
  aside.querySelectorAll('nav button').forEach(button=>button.addEventListener('click',()=>shell.classList.remove('show-mobile-menu')));
  const close=document.createElement('button');
  close.type='button';
  close.className='v6MobileClose';
  close.textContent='Close menu';
  close.addEventListener('click',()=>shell.classList.remove('show-mobile-menu'));
  aside.appendChild(close);
}
const observer=new MutationObserver(installMobileMenu);
observer.observe(document.body,{childList:true,subtree:true});
installMobileMenu();
