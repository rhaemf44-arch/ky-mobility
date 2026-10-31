// 기존 A안 motion.js(버전 20)의 영상 동기화 로직을 그대로 유지했습니다.
// 바뀐 점: 헤더 배경 전환 추가, 등장 애니메이션 대상 선택자를 v2 마크업에 맞춤.
(() => {
  'use strict';
  const root=document.documentElement;
  const header=document.querySelector('.header');
  const story=document.querySelector('.motion-story');
  const stage=story.querySelector('.motion-stage');
  const scenes=[...story.querySelectorAll('.motion-scene')];
  const copies=scenes.map(scene=>scene.querySelector('.motion-copy'));
  const controls=[...story.querySelectorAll('[data-chapter]')];
  const toggle=document.querySelector('.motion-toggle');
  const progress=story.querySelector('.motion-progress span');
  const film=story.querySelector('.journey-film');
  const playButton=story.querySelector('.journey-play');
  const playLabel=playButton.querySelector('.journey-play-label');
  const playIcon=playButton.querySelector('.journey-play-icon');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const points=[0,.5,1];
  const animations=new Set(),reveals=[];
  let userOff=false,keyboard=false,active=-1,frame=0,start=0,range=1,visible=true;
  let current=0,target=0,lastTick=0,ready=false,loading=false,playing=false,seekTarget=0;
  const filmFps=24,seekInterval=1000/30;
  let nextSeekAt=0,lastRendered=-1;
  const sceneStates=scenes.map(()=>null),copyTransforms=scenes.map(()=>null);
  const clamp=value=>Math.min(1,Math.max(0,value));
  const smooth=(a,b,value)=>{const p=clamp((value-a)/(b-a));return p*p*(3-2*p);};
  const staticMode=()=>userOff||reduced.matches;
  const duration=()=>Math.max(.1,(Number.isFinite(film.duration)?film.duration:17)-.045);
  function animate(element,frames,options){
    const animation=element.animate(frames,options);animations.add(animation);
    animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
  }
  function clearAnimations(){animations.forEach(animation=>animation.cancel());animations.clear();}
  function activate(index,weights){
    scenes.forEach((scene,i)=>{
      const selected=i===index,currentScene=selected&&weights[i]>.15;
      if(sceneStates[i]!==currentScene){
        sceneStates[i]=currentScene;
        scene.classList.toggle('is-active',currentScene);scene.inert=!currentScene;
        scene.setAttribute('aria-hidden',String(!currentScene));
      }
      if(active!==index)controls[i].setAttribute('aria-pressed',String(selected));
    });
    active=index;
  }
  function render(p){
    const renderKey=p.toFixed(5)+'/'+staticMode()+'/'+keyboard+'/'+ready;
    if(lastRendered===renderKey)return;
    lastRendered=renderKey;
    // 영상 6.5초 지점에 4초의 도로 주행이 추가돼 있어 그 구간에서는 도로 장면 문구를 유지합니다.
    // 영상 길이를 바꾸면 아래 17, 6.5, 10.5, 4, 13 값도 함께 조정해야 합니다.
    const time=p*17;
    const narrative=clamp((time<=6.5?time:time<=10.5?6.5:time-4)/13);
    const index=narrative<.28?0:narrative<.76?1:2;
    const still=staticMode()||keyboard||!ready;
    const weights=still?scenes.map((_,i)=>i===index?1:0):[
      1-smooth(.16,.27,narrative),
      smooth(.27,.36,narrative)*(1-smooth(.65,.75,narrative)),
      smooth(.75,.84,narrative)
    ];
    activate(index,weights);
    scenes.forEach((scene,i)=>{
      const opacity=String(Math.round(weights[i]*10000)/10000);
      if(scene.style.opacity!==opacity)scene.style.opacity=opacity;
      const local=clamp((narrative-[0,.27,.75][i])/[.27,.48,.25][i]);
      const y=i===0?-60*local:i===1?38*(1-smooth(0,.22,local))-45*smooth(.75,1,local):32*(1-smooth(0,.4,local));
      const transform=still?'none':'translate3d(0,'+y.toFixed(2)+'px,0)';
      if(copyTransforms[i]!==transform){copies[i].style.transform=transform;copyTransforms[i]=transform;}
    });
    progress.style.transform='scaleX('+p+')';
    stage.dataset.progress=p.toFixed(4);
  }
  function needsSeek(){return Math.abs(film.currentTime-seekTarget)>1/(filmFps*2);}
  function seek(now){
    if(!ready||playing||staticMode()||film.seeking||now+1<nextSeekAt||!needsSeek())return;
    nextSeekAt=now+seekInterval;
    try{film.currentTime=seekTarget;}catch{/* 마지막으로 표시된 프레임 유지 */}
  }
  film.addEventListener('seeked',()=>{
    stage.dataset.filmTime=film.currentTime.toFixed(3);
    nextSeekAt=Math.max(nextSeekAt,performance.now()+16);
    schedule();
  });
  function syncFilm(p){seekTarget=Math.min(duration(),Math.round(p*duration()*filmFps)/filmFps);}
  function renderTick(now){
    frame=0;
    const dt=lastTick?now-lastTick:16;lastTick=now;
    if(staticMode()||!visible||document.hidden){lastTick=0;return;}
    if(playing){
      current=target=clamp(film.currentTime/duration());
      render(current);stage.dataset.filmTime=film.currentTime.toFixed(3);
      const top=Math.round(start+range*current);
      if(Math.abs(scrollY-top)>1)window.scrollTo({top,behavior:'instant'});
      frame=requestAnimationFrame(renderTick);return;
    }
    current=keyboard?target:current+(target-current)*(1-Math.exp(-dt/105));
    if(Math.abs(current-target)<.00035)current=target;
    render(current);syncFilm(current);seek(now);
    if(current!==target||(ready&&needsSeek()))frame=requestAnimationFrame(renderTick);else lastTick=0;
  }
  function schedule(){
    if(!visible||staticMode()||frame||document.hidden)return;
    frame=requestAnimationFrame(renderTick);
  }
  function onScroll(){
    header.classList.toggle('is-solid',scrollY>start+range-10||staticMode()&&scrollY>40);
    if(!playing){target=clamp((scrollY-start)/range);schedule();}
  }
  function measure(){
    start=story.getBoundingClientRect().top+scrollY;
    range=Math.max(1,story.offsetHeight-stage.offsetHeight);
    if(!playing){target=clamp((scrollY-start)/range);schedule();}
  }
  function updatePlayButton(){
    playButton.setAttribute('aria-pressed',String(playing));
    const seconds=Math.round(Number.isFinite(film.duration)?film.duration:17);
    playButton.setAttribute('aria-label',playing?'여정 영상 일시정지':'출발부터 호텔 도착까지 '+seconds+'초 영상 재생');
    playLabel.textContent=playing?'일시정지':current>.98?'다시 보기':'여정 재생 · '+seconds+'초';
    playIcon.textContent=playing?'Ⅱ':'▶';
  }
  function stopPlayback(){
    if(!playing)return;
    playing=false;film.pause();root.classList.remove('journey-playing');
    target=current=clamp(film.currentTime/duration());seekTarget=film.currentTime;
    updatePlayButton();
  }
  async function loadFilm(){
    if(loading||staticMode())return;
    loading=true;
    try{
      // 기존 정적 호스트에서 byte-range 요청 문제가 있어 전체 파일을 Blob으로 불러옵니다.
      const response=await fetch(film.dataset.src,{cache:'force-cache'});
      if(!response.ok)throw new Error('Film unavailable');
      const media=await response.blob();
      const source=URL.createObjectURL(media);
      film.preload='auto';film.src=source;film.load();
      addEventListener('pagehide',event=>{if(!event.persisted)URL.revokeObjectURL(source);},{once:true});
    }catch{filmUnavailable();}
  }
  film.addEventListener('loadeddata',()=>{
    ready=true;stage.classList.add('film-ready');playButton.disabled=false;
    updatePlayButton();render(current);syncFilm(current);schedule();
  });
  function filmUnavailable(){
    ready=false;stopPlayback();stage.classList.remove('film-ready');stage.classList.add('film-unavailable');
    playButton.disabled=true;story.querySelector('.motion-scroll-hint').textContent='장면을 선택해 여정을 살펴보세요';
    render(current);
  }
  film.addEventListener('error',filmUnavailable);
  film.addEventListener('ended',()=>{
    stopPlayback();current=target=1;
    window.scrollTo({top:start+range,behavior:'instant'});
    render(1);syncFilm(1);schedule();updatePlayButton();
  });
  playButton.addEventListener('click',()=>{
    if(!ready||staticMode())return;
    if(playing){stopPlayback();return;}
    keyboard=false;root.classList.remove('motion-keyboard');clearAnimations();
    if(current>.98){film.currentTime=0;current=target=0;window.scrollTo({top:start,behavior:'instant'});}
    playing=true;root.classList.add('journey-playing');updatePlayButton();
    film.play().then(schedule).catch(()=>{stopPlayback();schedule();});
  });
  function showAllReveals(){reveals.forEach(el=>{el.style.opacity='1';el.style.transform='none';});}
  function setMotion(){
    stopPlayback();clearAnimations();
    root.classList.toggle('motion-off',userOff);root.classList.toggle('motion-reduced',reduced.matches);
    toggle.setAttribute('aria-pressed',String(staticMode()));
    toggle.textContent=reduced.matches?'기기 설정: 움직임 줄이기':staticMode()?'움직임 켜기':'움직임 줄이기';
    if(staticMode()){render(points[Math.max(0,active)]);showAllReveals();}else loadFilm();
    measure();onScroll();
  }
  controls.forEach((button,index)=>button.addEventListener('click',()=>{
    stopPlayback();clearAnimations();
    if(staticMode()){current=target=points[index];render(current);return;}
    window.scrollTo({top:start+range*points[index],behavior:keyboard?'instant':'smooth'});
  }));
  toggle.addEventListener('click',()=>{
    if(reduced.matches)return;
    const wasInStory=scrollY>=start&&scrollY<start+story.offsetHeight;
    userOff=!userOff;setMotion();
    if(wasInStory){window.scrollTo({top:start,behavior:'instant'});current=target=0;render(0);syncFilm(0);schedule();}
  });
  reduced.addEventListener('change',setMotion);
  document.addEventListener('keydown',event=>{
    if(['Shift','Control','Alt','Meta'].includes(event.key))return;
    if(event.target.closest('.journey-play')&&[' ','Enter'].includes(event.key))return;
    stopPlayback();keyboard=true;root.classList.add('motion-keyboard');clearAnimations();showAllReveals();schedule();
  });
  function pointerMode(event){
    if(event.type==='wheel'||!event.target.closest('.journey-play'))stopPlayback();
    if(keyboard){keyboard=false;root.classList.remove('motion-keyboard');}
    schedule();
  }
  document.addEventListener('pointerdown',pointerMode,{passive:true});
  addEventListener('wheel',pointerMode,{passive:true});addEventListener('touchstart',pointerMode,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();else{onScroll();schedule();}});
  root.classList.add('motion-enhanced');setMotion();render(0);
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',measure,{passive:true});
  new ResizeObserver(measure).observe(stage);
  new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;root.classList.toggle('motion-in-hero',visible);
    if(visible){loadFilm();onScroll();}else stopPlayback();
  },{rootMargin:'60px'}).observe(stage);
  if(!staticMode()&&scrollY<120){
    scenes[0].querySelectorAll('.motion-line>span').forEach((line,index)=>animate(line,[{transform:'translateY(105%)',opacity:.2},{transform:'translateY(0)',opacity:1}],{duration:700,delay:index*65,easing:'cubic-bezier(.23,1,.32,1)'}));
  }
  const revealObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      const el=entry.target;revealObserver.unobserve(el);el.style.opacity='1';
      if(staticMode()||keyboard)return;
      animate(el,[{opacity:0,transform:'translateY(28px)'},{opacity:1,transform:'translateY(0)'}],{duration:650,delay:Number(el.dataset.revealDelay||0),easing:'cubic-bezier(.23,1,.32,1)'});
    });
  },{threshold:.12,rootMargin:'0px 0px -45px 0px'});
  document.querySelectorAll('.service-intro,.service-row,.section-head,.vehicle-card,.process-grid li,.factor,.atmosphere-photo,.atmosphere-copy,.guide-layout>div').forEach((el,index)=>{
    reveals.push(el);el.dataset.revealDelay=String(el.classList.contains('vehicle-card')?(index%3)*50:0);
    if(!staticMode()&&!keyboard&&el.getBoundingClientRect().top>innerHeight)el.style.opacity='0';
    revealObserver.observe(el);
  });
})();
