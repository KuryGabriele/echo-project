const sdpTransform = require('sdp-transform');
const goodOpusSettings = "minptime=10;useinbandfec=1;maxplaybackrate=48000;stereo=1;maxaveragebitrate=510000";
const ep = require("./echoProtocol.js");

const ICE_SERVERS = [{
  username: 'echo',
  credential: 'echo123',
  urls: ["turn:kury.ddns.net:6984"]
}];

class audioRtcReceiver {
  constructor(id, senderId, deviceId = 'default', volume = 1.0) {
    this.id = id;
    this.senderId = senderId;
    this.deviceId = deviceId;
    this.volume = volume;
    this.peer = null;
    this.stream = null;
    this.isReceiving = false;
    this.isMuted = false;
    this.audioElement = new Audio();
    this.context = null;
    this.gainNode = null;
    this.personalGainNode = null;
    this.muteNode = null;


    console.log("Created receiver", this.id, this.senderId, this.deviceId, this.volume);
  }

  async init() {
    this.peer = this.createPeer();
    this.peer.addTransceiver('audio', { direction: 'recvonly' });
  }

  setVolume(volume) {
    if (volume > 1.0 || volume < 0.0) {
      console.error("Volume must be between 0.0 and 1.0", volume);
      volume = 1.0;
    }

    this.volume = volume;
    this.personalGainNode.gain.value = volume;
    this.unmute();

    this.muted = false;
  }

  setGlobalVolume(volume) {
    if (volume > 1.0 || volume < 0.0) {
      console.error("Volume must be between 0.0 and 1.0", volume);
      volume = 1.0;
    }

    this.gainNode.gain.value = volume;
  }

  setDevice(deviceId) {
    console.log("Setting device", deviceId);
    if (deviceId === 'default') {
      return
    }
    this.deviceId = deviceId;
    this.context.setSinkId(deviceId);
  }

  mute() {
    this.muteNode.gain.value = 0.0;
    this.isMuted = true;
  }

  unmute() {
    this.muteNode.gain.value = 1.0;
    this.isMuted = false;
  }

  close() {
    console.log("=== Closing receiver for user", this.senderId, "===");
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    } else {
      console.log("Audio element null")
    }
    if (this.stream && this.stream.getTracks()) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    } else {
      console.log("stream null")
    }
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    } else {
      console.log("peer null")
    }

    this.isReceiving = false;
    console.log("=== Should be closed ===");
  }

  addCandidate(candidate) {
    if (this.peer) {
      this.peer.addIceCandidate(candidate);
    }
  }

  createPeer() {
    const peer = new RTCPeerConnection({
      iceServers: ICE_SERVERS
    });
    peer.ontrack = (e) => { this.handleTrackEvent(e) };
    //Handle the ice candidates
    peer.onnegotiationneeded = () => { this.handleNegotiationNeededEvent(peer) };

    peer.onicecandidate = (e) => {
      console.log("Got ice candidate from stun", e)
      if (e.candidate) {
        ep.sendIceCandidate({
          candidate: e.candidate,
          senderId: this.senderId,
          receiverId: this.id,
        });
      }
    }

    return peer;
  }

  handleTrackEvent(e) {
    this.context = new AudioContext();
    if (this.deviceId !== 'default' && this.deviceId) {
      this.context.setSinkId(this.deviceId);
    }
    let source = this.context.createMediaStreamSource(e.streams[0]);
    let destination = this.context.destination;

    this.gainNode = this.context.createGain();
    this.personalGainNode = this.context.createGain();
    this.muteNode = this.context.createGain();

    source.connect(this.gainNode);
    this.gainNode.connect(this.personalGainNode);
    this.personalGainNode.connect(this.muteNode);
    this.muteNode.connect(destination);

    this.context.resume();

    //Need this cuz of bug in chrome
    console.log("Got track event", e)
    this.stream = e.streams[0];
    this.audioElement.srcObject = this.stream;
    this.audioElement.autoplay = true;
    if (this.deviceId !== 'default') {
      //this.audioElement.setSinkId(this.deviceId);
    }
    this.audioElement.pause();
    this.isReceiving = true;
  };

  async handleNegotiationNeededEvent(peer) {
    const offer = await peer.createOffer();

    let parsed = sdpTransform.parse(offer.sdp);
    parsed.media[0].fmtp[0].config = goodOpusSettings;
    offer.sdp = sdpTransform.write(parsed);

    await peer.setLocalDescription(offer);

    ep.subscribeAudio({
      sdp: peer.localDescription,
      senderId: this.senderId,
      receiverId: this.id,
    }, (description) => {
      const desc = new RTCSessionDescription(description);
      peer.setRemoteDescription(desc).catch(e => console.log(e));
    });
  }

  static async getAudioDevices() {
    return new Promise((resolve, reject) => {
      var out = [];
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        devices.forEach((device, id) => {
          if (device.kind === "audiooutput" && device.deviceId !== "communications" && device.deviceId !== "default") {
            out.push({
              "name": device.label,
              "id": device.deviceId
            })
          }
        })

        resolve(out);
      })
    })
  }

}

export default audioRtcReceiver;