const b64e=s=>btoa(unescape(encodeURIComponent(s)));
const b64d=s=>decodeURIComponent(escape(atob(s.trim())));

export class TabsTransport{
  constructor(room,onMessage){
    this.room=room;
    this.onMessage=onMessage;
    this.ch=new BroadcastChannel('aether-draughts::'+room);
    this.ch.onmessage=e=>this.onMessage&&this.onMessage(e.data);
  }
  send(m){try{this.ch.postMessage(m);}catch(e){}}
  close(){this.ch.close();}
}

export class RTCRoom{
  constructor(onMessage){
    this.onMessage=onMessage;
    this.pc=null;
    this.dc=null;
    this.onOpen=null;
    this.onClose=null;
    this.pc=new RTCPeerConnection({iceServers:[
      {urls:'stun:stun.l.google.com:19302'},
      {urls:'stun:stun1.l.google.com:19302'},
    ]});
  }
  _hook(dc){
    this.dc=dc;
    dc.onopen=()=>this.onOpen&&this.onOpen();
    dc.onclose=()=>this.onClose&&this.onClose();
    dc.onmessage=e=>{
      try{this.onMessage&&this.onMessage(JSON.parse(e.data));}catch(err){}
    };
  }
  _gathered(){
    return new Promise(res=>{
      if(this.pc.iceGatheringState==='complete')return res();
      const check=()=>{if(this.pc.iceGatheringState==='complete'){this.pc.removeEventListener('icegatheringstatechange',check);res();}};
      this.pc.addEventListener('icegatheringstatechange',check);
      setTimeout(res,3500);
    });
  }
  async host(){
    this._hook(this.pc.createDataChannel('game',{ordered:true}));
    const offer=await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this._gathered();
    return b64e(JSON.stringify(this.pc.localDescription));
  }
  async acceptOffer(offerCode){
    this.pc.ondatachannel=e=>this._hook(e.channel);
    await this.pc.setRemoteDescription(JSON.parse(b64d(offerCode)));
    const answer=await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this._gathered();
    return b64e(JSON.stringify(this.pc.localDescription));
  }
  async acceptAnswer(answerCode){
    await this.pc.setRemoteDescription(JSON.parse(b64d(answerCode)));
  }
  send(m){
    if(this.dc&&this.dc.readyState==='open')this.dc.send(JSON.stringify(m));
  }
  close(){try{this.dc&&this.dc.close();this.pc&&this.pc.close();}catch(e){}}
}
