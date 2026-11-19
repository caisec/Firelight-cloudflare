'use strict';
(() => {
  const $=id=>document.getElementById(id), canvas=$('world');
  let ws=null, me=null, roomCode='', isHost=false, myColor='spectator', roster=[], localStream=null, micOn=false;
  let rtcConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
  const peerLinks=new Map(), avatars=new Map(), keys={}, ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
  const avatarConfig={coat:'#8f6ad8',hair:'#342719',skin:'#e0a97f'};
  let toastTimer=0, selectedSquare=null, validTargets=[], lastMove='';

  // Soft dusk scene, a little clearing, and a warm campfire.
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x111528);scene.fog=new THREE.FogExp2(0x111528,.018);
  const camera=new THREE.PerspectiveCamera(48,1,.1,180);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const hemi=new THREE.HemisphereLight(0x9eafd9,0x352b30,1.1);scene.add(hemi);
  const moon=new THREE.DirectionalLight(0x9fb9ff,.5);moon.position.set(-18,28,12);moon.castShadow=true;moon.shadow.mapSize.set(1024,1024);scene.add(moon);
  const ground=new THREE.Mesh(new THREE.CircleGeometry(32,64),new THREE.MeshLambertMaterial({color:0x354936}));ground.rotation.x=-Math.PI/2;ground.position.y=-.07;ground.receiveShadow=true;scene.add(ground);
  const clearing=new THREE.Mesh(new THREE.CircleGeometry(12,48),new THREE.MeshLambertMaterial({color:0x70604c}));clearing.rotation.x=-Math.PI/2;clearing.position.y=-.025;clearing.receiveShadow=true;scene.add(clearing);
  const path=new THREE.Mesh(new THREE.PlaneGeometry(4,25),new THREE.MeshLambertMaterial({color:0x6d5c46}));path.rotation.x=-Math.PI/2;path.position.set(0,-.015,18);scene.add(path);
  const fireLight=new THREE.PointLight(0xff8a3c,3.2,19,1.7);fireLight.position.set(0,1.3,0);fireLight.castShadow=true;scene.add(fireLight);
  const fire=new THREE.Group();scene.add(fire);
  const stones=[];for(let i=0;i<13;i++){let a=i/13*Math.PI*2,r=1.05+(i%3)*.04;let m=new THREE.Mesh(new THREE.DodecahedronGeometry(.19,0),new THREE.MeshLambertMaterial({color:i%2?0x716961:0x82786d}));m.position.set(Math.cos(a)*r,.12,Math.sin(a)*r);m.scale.y=.55;m.castShadow=true;fire.add(m);}
  const flameMats=[0xff7b32,0xffb53e,0xffe28a].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.85}));
  const flames=[];for(let i=0;i<7;i++){let cone=new THREE.Mesh(new THREE.ConeGeometry(.34+(i%3)*.06,.9+(i%2)*.25,7),flameMats[i%3]);cone.position.set((Math.random()-.5)*.38,.55+Math.random()*.22,(Math.random()-.5)*.32);cone.rotation.z=(Math.random()-.5)*.3;fire.add(cone);flames.push(cone);}
  for(const [x,z,rot] of [[-1.8,0,0],[1.8,0,0],[0,-1.8,Math.PI/2],[0,1.8,Math.PI/2]]){
    const log=new THREE.Mesh(new THREE.CylinderGeometry(.16,.18,2.45,8),new THREE.MeshLambertMaterial({color:0x52331f}));log.rotation.z=Math.PI/2;log.rotation.y=rot;log.position.set(x*.22,.18,z*.22);log.castShadow=true;fire.add(log);
  }
  // A ring of stools and lanterns around the clearing.
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2+.15,x=Math.cos(a)*4.5,z=Math.sin(a)*4.5;
    const seat=new THREE.Mesh(new THREE.CylinderGeometry(.55,.62,.22,12),new THREE.MeshLambertMaterial({color:i%2?0x68442c:0x765039}));seat.position.set(x,.44,z);seat.castShadow=true;seat.receiveShadow=true;scene.add(seat);
    const legMat=new THREE.MeshLambertMaterial({color:0x38261c});for(const dx of [-.34,.34])for(const dz of [-.32,.32]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,.45,6),legMat);leg.position.set(x+dx,.22,z+dz);scene.add(leg);}
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,2.6,6),new THREE.MeshLambertMaterial({color:0x342a27}));pole.position.set(Math.cos(a)*7.5,1.3,Math.sin(a)*7.5);scene.add(pole);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.16,8,8),new THREE.MeshBasicMaterial({color:0xffc878}));lamp.position.set(Math.cos(a)*7.5,2.55,Math.sin(a)*7.5);scene.add(lamp);
    const glow=new THREE.PointLight(0xffb364,.35,7,2);glow.position.copy(lamp.position);scene.add(glow);
  }
  // Tree silhouettes and starfield.
  const trunkMat=new THREE.MeshLambertMaterial({color:0x382d2b}),leafMats=[0x182a27,0x1d312a,0x24352b].map(c=>new THREE.MeshLambertMaterial({color:c}));
  for(let i=0;i<38;i++){let a=i/38*Math.PI*2+(Math.random()-.5)*.12,r=18+Math.random()*13,h=2.5+Math.random()*3,x=Math.cos(a)*r,z=Math.sin(a)*r;let t=new THREE.Mesh(new THREE.CylinderGeometry(.2,.34,h,7),trunkMat);t.position.set(x,h/2,z);scene.add(t);for(let j=0;j<3;j++){let c=new THREE.Mesh(new THREE.ConeGeometry(1.3+j*.25,2.8,7),leafMats[(i+j)%3]);c.position.set(x,h*.55+j*.75,z);c.castShadow=true;scene.add(c);}}
  const starPos=[];for(let i=0;i<420;i++){let a=Math.random()*Math.PI*2,e=.12+Math.random()*1.15,r=90;starPos.push(Math.cos(a)*Math.cos(e)*r,Math.sin(e)*r,Math.sin(a)*Math.cos(e)*r);}const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xe9e3ff,size:.65,transparent:true,opacity:.9,fog:false})));

  const floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0), mouseTarget=new THREE.Vector3();
  let cameraYaw=0,cameraPitch=.47,cameraDist=14,drag=null,playerPos=new THREE.Vector3(0,0,7),moveTarget=null;
  const avatarTags=document.createElement('div');Object.assign(avatarTags.style,{position:'fixed',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:1});document.body.appendChild(avatarTags);
  function makeAvatar(id,name,config,isMe=false){
    if(avatars.has(id))return avatars.get(id);
    const root=new THREE.Group();root.userData.id=id;
    const coat=new THREE.MeshLambertMaterial({color:config.coat||'#8f6ad8'}),skin=new THREE.MeshLambertMaterial({color:config.skin||'#e0a97f'}),hair=new THREE.MeshLambertMaterial({color:config.hair||'#342719'}),dark=new THREE.MeshLambertMaterial({color:0x2b2633});
    const body=new THREE.Group();root.add(body);
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(.34,.43,.95,10),coat);torso.position.y=1.06;torso.castShadow=true;body.add(torso);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.34,14,12),skin);head.position.y=1.83;head.castShadow=true;body.add(head);
    const hairCap=new THREE.Mesh(new THREE.SphereGeometry(.36,14,8,0,Math.PI*2,0,Math.PI*.56),hair);hairCap.position.y=2;hairCap.castShadow=true;body.add(hairCap);
    // Friendly readable face: whites, bright irises, brows, a little nose and smile.
    const face=new THREE.Group();face.position.y=1.83;body.add(face);
    const eyeWhite=new THREE.MeshBasicMaterial({color:0xfff8ea}),iris=new THREE.MeshBasicMaterial({color:config.eyes||0x58a9b7}),pupil=new THREE.MeshBasicMaterial({color:0x151522}),mouthMat=new THREE.MeshBasicMaterial({color:0x873e3c});
    const eyes=[];
    for(const x of [-.12,.12]){
      const white=new THREE.Mesh(new THREE.SphereGeometry(.058,10,8),eyeWhite);white.position.set(x,.025,.302);face.add(white);
      const color=new THREE.Mesh(new THREE.SphereGeometry(.032,10,8),iris);color.position.set(x,.02,.35);face.add(color);eyes.push(color);
      const black=new THREE.Mesh(new THREE.SphereGeometry(.017,8,8),pupil);black.position.set(x,.02,.376);face.add(black);
      const brow=new THREE.Mesh(new THREE.BoxGeometry(.12,.026,.028),hair);brow.position.set(x,.108,.365);brow.rotation.z=x<0?-.08:.08;face.add(brow);
    }
    const nose=new THREE.Mesh(new THREE.SphereGeometry(.037,10,8),skin);nose.scale.set(.78,1,.72);nose.position.set(0,-.05,.335);face.add(nose);
    const smile=new THREE.Mesh(new THREE.BoxGeometry(.105,.022,.018),mouthMat);smile.position.set(0,-.137,.319);face.add(smile);
    const legMat=dark;const legs=[];for(const s of [-1,1]){let leg=new THREE.Mesh(new THREE.CylinderGeometry(.12,.14,.65,8),legMat);leg.position.set(s*.16,.4,0);body.add(leg);legs.push(leg);}
    const arms=[];for(const s of [-1,1]){let pivot=new THREE.Group();pivot.position.set(s*.39,1.42,0);body.add(pivot);let arm=new THREE.Mesh(new THREE.CylinderGeometry(.105,.13,.64,8),coat);arm.position.y=-.28;arm.rotation.z=-s*.1;pivot.add(arm);arms.push(pivot);}
    let label=document.createElement('div');label.className='tag';label.textContent=name;Object.assign(label.style,{position:'absolute',left:'0',top:'0',padding:'3px 9px',borderRadius:'99px',background:'rgba(16,15,29,.78)',border:'1px solid #ffffff33',color:isMe?'#ffe2b4':'#fff4e7',font:'700 12px system-ui',whiteSpace:'nowrap'});avatarTags.appendChild(label);
    const obj={id,name,root,body,torso,arms,legs,label,config:{...config},isMe,phase:Math.random()*6,emote:'',emoteAt:0,home:new THREE.Vector3(0,0,7),target:null};
    root.position.copy(isMe?playerPos:new THREE.Vector3((Math.random()-.5)*10,0,(Math.random()-.5)*10));scene.add(root);avatars.set(id,obj);return obj;
  }
  function recolor(obj,config){obj.config={...obj.config,...config};obj.torso.material.color.set(obj.config.coat);obj.root.children[0].children[1].material.color.set(obj.config.skin);obj.root.children[0].children[2].material.color.set(obj.config.hair);}
  function setRoster(list){
    roster=list;
    const active=new Set(list.map(p=>p.id));
    for(const [id,a] of avatars)if(!a.isMe&&!active.has(id)){scene.remove(a.root);a.label.remove();avatars.delete(id);closePeer(id);}
    for(const p of list){if(p.id===me){myColor=p.color;continue;}let a=makeAvatar(p.id,p.name,p.avatar);a.name=p.name;a.nameColor=p.nameColor||'#fff4e7';a.label.style.color=a.nameColor;if(!peerLinks.has(p.id))ensurePeer(p.id);}
    $('online').textContent=`${list.length} here`;
    $('roster').replaceChildren(...list.map(p=>{let e=document.createElement('span');e.className='person';e.style.color=p.nameColor||'#fff4e7';e.style.borderColor=(p.nameColor||'#fff4e7')+'66';e.textContent=p.name+(p.id===me?' (you)':'')+(p.color==='white'?' ♔':p.color==='black'?' ♚':'');if(p.voice){let v=document.createElement('b');v.className='voice';v.textContent=' · mic';e.append(v);}return e;}));
    const whiteName=list.find(p=>p.color==='white')?.name||'waiting',blackName=list.find(p=>p.color==='black')?.name||'waiting';
    $('chessSeat').textContent=`♔ ${whiteName}  ·  ♚ ${blackName}`;
    renderBoard();
  }
  function toast(text,ms=2800){const t=$('toast');t.textContent=text;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,ms);}
  function send(obj){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
  function addMessage(name,text,system=false,id=null){const row=document.createElement('div');row.className='msg'+(system?' system':'');if(!system){let n=document.createElement('span');n.className='name';n.textContent=name+':';const color=roster.find(p=>p.id===id)?.nameColor;if(color)n.style.color=color;row.append(n);}row.append(document.createTextNode(text));$('chatlog').append(row);$('chatlog').scrollTop=$('chatlog').scrollHeight;}
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  async function connect(create,code,name){
    if(ws)ws.close();const avatar={coat:avatarConfig.coat,hair:avatarConfig.hair,skin:avatarConfig.skin};
    if(create){
      const response=await fetch('/api/rooms',{method:'POST'});
      if(!response.ok)throw new Error('Could not create a room. Try again in a moment.');
      code=(await response.json()).room;
    }
    return new Promise((resolve,reject)=>{
      const protocol=location.protocol==='https:'?'wss':'ws';ws=new WebSocket(`${protocol}://${location.host}/ws?room=${encodeURIComponent(code)}`);
      const timeout=setTimeout(()=>{try{ws.close();}catch{}reject(new Error('Connection took too long. Is the room server awake?'));},10000);
      ws.onopen=()=>send({type:'join',name,avatar});
      ws.onerror=()=>{clearTimeout(timeout);reject(new Error('Could not connect to the hangout server.'));};
      ws.onmessage=async ev=>{
        let m;try{m=JSON.parse(ev.data);}catch{return;}
        if(m.type==='error'){clearTimeout(timeout);toast(m.message,4000);reject(new Error(m.message));try{ws.close();}catch{}return;}
        if(m.type==='welcome'){
          clearTimeout(timeout);me=m.id;roomCode=m.room;isHost=m.host;if(Array.isArray(m.iceServers)&&m.iceServers.length)rtcConfig={iceServers:m.iceServers};setRoster(m.players||[]);
          const self=(m.players||[]).find(p=>p.id===me);if(self){const mine=makeAvatar(me,self.name,self.avatar,true);mine.root.position.copy(playerPos);mine.nameColor=self.nameColor||'#ffd166';mine.label.style.color=mine.nameColor;}
          lastSentX=playerPos.x;lastSentZ=playerPos.z;sendMove();
          $('roomBadge').textContent=roomCode;$('landing').hidden=true;$('side').classList.add('open');
          if(m.chessFen){try{chess.load(m.chessFen);renderBoard();}catch{}}
          addMessage('',`Welcome to the fire. Room code: ${roomCode}.`,true);resolve(m);return;
        }
        if(m.type==='players')setRoster(m.players||[]);
        else if(m.type==='chat')addMessage(m.name,m.text,false,m.id);
        else if(m.type==='move'){let a=avatars.get(m.id);if(a){a.target=new THREE.Vector3(Number(m.x)||0,0,Number(m.z)||0);if(m.emote)playEmote(a,m.emote);}}
        else if(m.type==='avatar'){let a=avatars.get(m.id);if(a)recolor(a,m.avatar);}
        else if(m.type==='signal')await receiveSignal(m);
        else if(m.type==='chessMove')receiveChess(m);
        else if(m.type==='chessReject'){if(m.fen){try{chess.load(m.fen);}catch{chess.reset();}}else chess.reset();selectedSquare=null;validTargets=[];renderBoard();toast(m.message||'That move was out of turn.');}
        else if(m.type==='chessReset'){chess.reset();lastMove='';selectedSquare=null;validTargets=[];const pp=document.getElementById('promoPicker');if(pp)pp.remove();renderBoard();toast('A fresh chess game is ready.');}
        else if(m.type==='hostLeft'){addMessage('',`The room host left. This hangout has ended.`,true);toast('Host left the room.',5000);}
      };
      ws.onclose=()=>{if(me){addMessage('',`Connection closed.`,true);toast('Disconnected from the hangout.',4000);} };
    });
  }
  function readLandingAvatar(){avatarConfig.coat=$('coatInput').value;avatarConfig.hair=$('hairInput').value;}
  $('createBtn').onclick=async()=>{readLandingAvatar();const n=$('nameInput').value.trim()||'Friend';try{await connect(true,'',n);}catch(e){toast(e.message,5000);}};
  $('joinBtn').onclick=async()=>{readLandingAvatar();const code=$('roomInput').value.trim().toUpperCase();if(!code){toast('Enter the room code your friend shared.');return;}const n=$('nameInput').value.trim()||'Friend';try{await connect(false,code,n);}catch(e){toast(e.message,5000);}};

  // WebRTC peer mesh: audio goes directly between browsers; this server only signals connections.
  function ensurePeer(id){
    if(!id||id===me||peerLinks.has(id))return peerLinks.get(id);
    const pc=new RTCPeerConnection(rtcConfig),trans=pc.addTransceiver('audio',{direction:'sendrecv'}),entry={pc,trans,pending:[],remote:null};peerLinks.set(id,entry);
    if(localStream)trans.sender.replaceTrack(localStream.getAudioTracks()[0]||null).catch(err=>console.warn('Could not attach microphone track:',err));
    pc.onicecandidate=e=>{if(e.candidate)send({type:'signal',to:id,candidate:e.candidate.toJSON?e.candidate.toJSON():e.candidate});};
    pc.ontrack=e=>{
      // addTransceiver() can deliver a streamless track in some browsers; wrap it in a MediaStream.
      let stream=e.streams&&e.streams[0];
      if(!stream){stream=entry.remote||new MediaStream();if(!stream.getTracks().some(t=>t.id===e.track.id))stream.addTrack(e.track);}
      entry.remote=stream;let audio=document.getElementById('audio-'+id);
      if(!audio){audio=document.createElement('audio');audio.id='audio-'+id;audio.autoplay=true;audio.playsInline=true;audio.muted=false;audio.volume=1;$('audioBin').append(audio);}
      audio.srcObject=stream;audio.play().catch(()=>toast('Voice is connected. Tap the microphone once to enable incoming audio.',5000));
    };
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed')toast('Voice connection blocked by the network. A TURN relay may be needed.',6000);};
    if(me<id)pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>{const d=pc.localDescription;send({type:'signal',to:id,description:d.toJSON?d.toJSON():{type:d.type,sdp:d.sdp}});}).catch(err=>{console.warn('Voice offer failed:',err);toast('Could not start a voice connection. Reload and try again.',5000);});
    return entry;
  }
  async function receiveSignal(m){
    const e=ensurePeer(m.from);if(!e)return;
    try{
      if(m.description){await e.pc.setRemoteDescription(m.description);for(const c of e.pending.splice(0))await e.pc.addIceCandidate(c);
        if(m.description.type==='offer'){const ans=await e.pc.createAnswer();await e.pc.setLocalDescription(ans);const d=e.pc.localDescription;send({type:'signal',to:m.from,description:d.toJSON?d.toJSON():{type:d.type,sdp:d.sdp}});}}
      if(m.candidate){if(e.pc.remoteDescription)await e.pc.addIceCandidate(m.candidate);else e.pending.push(m.candidate);}
    }catch(err){console.warn('Voice signaling:',err);}
  }
  function closePeer(id){const e=peerLinks.get(id);if(e){e.pc.close();peerLinks.delete(id);}const audio=document.getElementById('audio-'+id);if(audio)audio.remove();}
  $('micBtn').onclick=async()=>{
    if(!me){toast('Join a room before turning on voice chat.');return;}
    if(micOn){micOn=false;if(localStream)localStream.getTracks().forEach(t=>t.stop());localStream=null;for(const e of peerLinks.values())e.trans.sender.replaceTrack(null).catch(()=>{});$('micBtn').classList.remove('on');send({type:'voice',enabled:false});toast('Microphone muted.');return;}
    // A real button gesture can also unlock autoplay for incoming voice in stricter browsers.
    document.querySelectorAll('#audioBin audio').forEach(a=>a.play().catch(()=>{}));
    try{localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});micOn=true;const track=localStream.getAudioTracks()[0];for(const p of roster)if(p.id!==me){const e=ensurePeer(p.id);if(e)await e.trans.sender.replaceTrack(track).catch(()=>{});}document.querySelectorAll('#audioBin audio').forEach(a=>a.play().catch(()=>{}));$('micBtn').classList.add('on');send({type:'voice',enabled:true});toast('Voice chat is on. You can mute any time.');}
    catch(e){toast('Microphone permission was blocked, or no microphone was found.',4500);micOn=false;}
  };

  // Room characters, simple walking, camera follow, silly emotes.
  function sendMove(emote=''){const a=avatars.get(me);if(!a)return;send({type:'move',x:playerPos.x,z:playerPos.z,emote});}
  function playEmote(a,type){a.emote=type;a.emoteAt=performance.now();if(type==='heart'||type==='laugh'){let bubble=document.createElement('div');bubble.className='tag';bubble.textContent=type==='heart'?'💛':'😂';Object.assign(bubble.style,{position:'absolute',fontSize:'24px',background:'transparent',border:0});avatarTags.append(bubble);a.bubble=bubble;setTimeout(()=>{bubble.remove();if(a.bubble===bubble)a.bubble=null;},1600);}}
  document.querySelectorAll('[data-emote]').forEach(b=>b.onclick=()=>doEmote(b.dataset.emote));
  $('customBtn').onclick=()=>{$('coatEdit').value=avatarConfig.coat;$('hairEdit').value=avatarConfig.hair;$('skinEdit').value=avatarConfig.skin;$('customModal').hidden=false;};
  $('saveAvatar').onclick=()=>{avatarConfig.coat=$('coatEdit').value;avatarConfig.hair=$('hairEdit').value;avatarConfig.skin=$('skinEdit').value;let a=avatars.get(me);if(a)recolor(a,avatarConfig);send({type:'avatar',avatar:avatarConfig});$('customModal').hidden=true;};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).hidden=true);
  $('chatForm').onsubmit=e=>{e.preventDefault();const text=$('chatInput').value.trim();if(!text)return;if(!me){addMessage($('nameInput').value||'You',text);$('chatInput').value='';return;}send({type:'chat',text});addMessage($('nameInput').value.trim()||'You',text,false,me);$('chatInput').value='';};
  $('chatToggle').onclick=()=>$('side').classList.toggle('open');
  $('roomBadge').onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);toast('Room code copied.');}catch{toast(`Room code: ${roomCode}`);}};
  $('leaveBtn').onclick=()=>{if(ws)ws.close();location.reload();};

  // Legal shared chess powered by the bundled chess.js rules engine.
  const chess=new Chess();
  const chessSeatsReady=()=>roster.some(p=>p.color==='white')&&roster.some(p=>p.color==='black');
  function renderBoard(){
    if(!$('board'))return;const board=$('board');board.replaceChildren();const boardArray=chess.board();
    const ready=chessSeatsReady();board.classList.toggle('waiting',!ready);
    const whiteView=myColor!=='black';
    for(let i=0;i<64;i++){
      const row=Math.floor(i/8),rank=whiteView?7-row:row,file=whiteView?i%8:7-(i%8),sq=String.fromCharCode(97+file)+(rank+1),piece=boardArray[7-rank][file];
      const cell=document.createElement('button');cell.type='button';cell.className='sq '+((rank+file)%2?'light':'dark');cell.dataset.square=sq;
      if(selectedSquare===sq)cell.classList.add('selected');if(validTargets.includes(sq))cell.classList.add('target');if(lastMove.split('-').includes(sq))cell.classList.add('last');
      if(piece){const glyph=document.createElement('span');glyph.className='piece '+(piece.color==='w'?'white':'black');glyph.textContent=({w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}}[piece.color][piece.type]);cell.append(glyph);}
      if((whiteView&&file===0)||(!whiteView&&file===7)){const c=document.createElement('small');c.className='coord rank';c.textContent=String(rank+1);cell.append(c);}
      if((whiteView&&rank===0)||(!whiteView&&rank===7)){const c=document.createElement('small');c.className='coord file';c.textContent=String.fromCharCode(97+file);cell.append(c);}
      cell.onclick=()=>boardClick(sq);board.append(cell);
    }
    let status=!ready?'Waiting for a second friend to take Black':chess.in_checkmate()?'Checkmate — '+(chess.turn()==='w'?'Black':'White')+' wins':chess.in_stalemate()?'Draw — stalemate':chess.in_threefold_repetition()?'Draw — threefold repetition':chess.insufficient_material()?'Draw — insufficient material':chess.in_draw()?'Draw':(chess.turn()==='w'?'White':'Black')+' to move'+(chess.in_check()?' · check':'');$('chessStatus').textContent=status;
    $('resetChess').disabled=!isHost||!ready;
  }
  function boardClick(sq){if(!me)return;if(!chessSeatsReady()){toast('Invite one friend to join as Black before starting chess.');return;}if(myColor!=='white'&&myColor!=='black'){toast('You are watching this game. The two players make the moves.');return;}const mine=(myColor==='white'&&chess.turn()==='w')||(myColor==='black'&&chess.turn()==='b');if(!mine){toast('Wait for your color to move.');return;}
    if(chess.game_over()){toast('The game is over. The host can start a new one.');return;}
    const piece=chess.get(sq);
    if(selectedSquare&&validTargets.includes(sq)){
      const from=selectedSquare,mover=chess.get(from);
      const promoting=mover&&mover.type==='p'&&((mover.color==='w'&&sq[1]==='8')||(mover.color==='b'&&sq[1]==='1'));
      if(promoting){askPromotion(mover.color,p=>playMove(from,sq,p));return;}
      playMove(from,sq);return;
    }
    if(piece&&piece.color===chess.turn()){selectedSquare=sq;validTargets=chess.moves({square:sq,verbose:true}).map(m=>m.to);}else{selectedSquare=null;validTargets=[];}renderBoard();
  }
  function playMove(from,to,promotion){
    const move=chess.move(promotion?{from,to,promotion}:{from,to});
    selectedSquare=null;validTargets=[];
    if(!move){renderBoard();return;}
    lastMove=move.from+'-'+move.to;renderBoard();
    send({type:'chessMove',move:{from:move.from,to:move.to,promotion:move.promotion},fen:chess.fen()});
  }
  // Pawn promotion picker (shown only to the player who is promoting).
  function askPromotion(color,done){
    const old=document.getElementById('promoPicker');if(old)old.remove();
    const wrap=document.createElement('div');wrap.id='promoPicker';
    Object.assign(wrap.style,{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(8,8,16,.6)',zIndex:60});
    const box=document.createElement('div');Object.assign(box.style,{display:'flex',gap:'10px',padding:'14px',borderRadius:'14px',background:'#1d1b2e',border:'1px solid #ffffff33'});
    const glyphs={w:{q:'♕',r:'♖',b:'♗',n:'♘'},b:{q:'♛',r:'♜',b:'♝',n:'♞'}}[color];
    for(const t of ['q','r','b','n']){
      const btn=document.createElement('button');btn.type='button';btn.textContent=glyphs[t];btn.title={q:'Queen',r:'Rook',b:'Bishop',n:'Knight'}[t];
      Object.assign(btn.style,{fontSize:'44px',width:'66px',height:'66px',borderRadius:'10px',border:'1px solid #ffffff44',background:'#f1e6d0',color:'#111',cursor:'pointer'});
      btn.onclick=()=>{wrap.remove();done(t);};box.append(btn);
    }
    wrap.append(box);
    wrap.onclick=e=>{if(e.target===wrap){wrap.remove();selectedSquare=null;validTargets=[];renderBoard();}};
    document.body.append(wrap);
  }
  function receiveChess(m){if(m.fen){try{chess.load(m.fen);if(m.move)lastMove=m.move.from+'-'+m.move.to;selectedSquare=null;validTargets=[];renderBoard();}catch{}}}
  $('chessBtn').onclick=()=>{$('chessModal').hidden=false;renderBoard();};
  $('resetChess').onclick=()=>{if(isHost)send({type:'chessReset'});};

  // Controls + renderer loop.
  function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
  addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName))return;const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){keys[k]=true;e.preventDefault();}});
  addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:0};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;let dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;drag.moved=Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy);if(drag.moved>5){cameraYaw-=dx*.005;cameraPitch=Math.max(.18,Math.min(1.15,cameraPitch+dy*.004));}});
  canvas.addEventListener('pointerup',e=>{let d=drag;drag=null;if(!d||d.moved>6)return;const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));ray.setFromCamera(ndc,camera);if(ray.ray.intersectPlane(floorPlane,mouseTarget)){const x=Math.max(-18,Math.min(18,mouseTarget.x)),z=Math.max(-18,Math.min(18,mouseTarget.z));moveTarget=new THREE.Vector3(x,0,z);}});
  canvas.addEventListener('wheel',e=>{cameraDist=Math.max(7,Math.min(23,cameraDist+e.deltaY*.012));e.preventDefault();},{passive:false});
  function labelPosition(a){const v=new THREE.Vector3(a.root.position.x,2.55,a.root.position.z).project(camera);a.label.hidden=v.z>1;if(!a.label.hidden)a.label.style.transform=`translate(${(v.x*.5+.5)*innerWidth}px,${(-v.y*.5+.5)*innerHeight}px) translate(-50%,-100%)`;if(a.bubble){const b=new THREE.Vector3(a.root.position.x,3.35,a.root.position.z).project(camera);a.bubble.style.transform=`translate(${(b.x*.5+.5)*innerWidth}px,${(-b.y*.5+.5)*innerHeight}px) translate(-50%,-50%)`;}}
  let last=performance.now(),time=0,lastNet=0,lastSentX=NaN,lastSentZ=NaN;
  function frame(){requestAnimationFrame(frame);const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;time+=dt;
    // Keep the campfire alive but gentle: slower, smaller light and flame variations reduce visual fatigue.
    fireLight.intensity=2.65+Math.sin(time*1.15)*.11+Math.sin(time*2.05)*.045;flames.forEach((f,i)=>{f.scale.y=.82+Math.sin(time*1.8+i*1.1)*.075;f.rotation.z=Math.sin(time*1.1+i*.7)*.055;f.material.opacity=.81+Math.sin(time*2.2+i*.8)*.045;});
    const meObj=avatars.get(me);let dx=0,dz=0;if(meObj){const f=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0),r=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);if(f||r){const sy=Math.sin(cameraYaw),cy=Math.cos(cameraYaw);dx=-sy*f+cy*r;dz=-cy*f-sy*r;moveTarget=null;}if(!dx&&!dz&&moveTarget){dx=moveTarget.x-playerPos.x;dz=moveTarget.z-playerPos.z;const d=Math.hypot(dx,dz);if(d<.25){moveTarget=null;dx=dz=0;}else{dx/=d;dz/=d;}}if(dx||dz){let l=Math.hypot(dx,dz);playerPos.x+=dx/l*4.3*dt;playerPos.z+=dz/l*4.3*dt;playerPos.x=Math.max(-18,Math.min(18,playerPos.x));playerPos.z=Math.max(-18,Math.min(18,playerPos.z));meObj.root.position.copy(playerPos);meObj.root.rotation.y=Math.atan2(dx,dz);meObj.phase+=dt*10;} }
    for(const a of avatars.values()){
      let walking=!!(a.isMe&&(dx||dz));
      if(!a.isMe&&a.target){let ddx=a.target.x-a.root.position.x,ddz=a.target.z-a.root.position.z,d=Math.hypot(ddx,ddz);if(d>.09){a.root.position.x+=ddx/d*Math.min(d,4*dt);a.root.position.z+=ddz/d*Math.min(d,4*dt);a.root.rotation.y=Math.atan2(ddx,ddz);a.phase+=dt*8;walking=true;}else a.target=null;}
      const dance=a.emote==='dance'&&now-a.emoteAt<2300,sit=a.emote==='sit'&&now-a.emoteAt<8000,wave=a.emote==='wave'&&now-a.emoteAt<1800;
      a.body.position.y=sit?-.38:(dance?Math.abs(Math.sin(now*.012))* .18:0);a.body.rotation.z=dance?Math.sin(now*.012)*.22:0;
      a.legs.forEach((leg,i)=>leg.rotation.x=walking?Math.sin(a.phase+i*Math.PI)*.55:0);
      a.arms.forEach((arm,i)=>{arm.rotation.x=dance?Math.sin(now*.012+i*Math.PI)*.9:0;arm.rotation.z=wave&&i===0?Math.sin(now*.022)*.9:0;});
      labelPosition(a);
    }
    const focus=meObj?meObj.root.position:new THREE.Vector3();const tx=focus.x+Math.sin(cameraYaw)*Math.cos(cameraPitch)*cameraDist,tz=focus.z+Math.cos(cameraYaw)*Math.cos(cameraPitch)*cameraDist,ty=focus.y+Math.sin(cameraPitch)*cameraDist;
    camera.position.lerp(new THREE.Vector3(tx,ty,tz),Math.min(1,dt*5));camera.lookAt(focus.x,focus.y+1.15,focus.z);
    if(meObj&&now-lastNet>800){const moved=Math.hypot(playerPos.x-lastSentX,playerPos.z-lastSentZ)>.12;if(moved){lastNet=now;sendMove();lastSentX=playerPos.x;lastSentZ=playerPos.z;}}
    renderer.render(scene,camera);
  }frame();
  // Keep emotes visible to remote friends for a brief interval.
  function doEmote(type){const a=avatars.get(me);if(!a)return;playEmote(a,type);send({type:'move',x:playerPos.x,z:playerPos.z,emote:type});}

  $('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('createBtn').click();});
})();