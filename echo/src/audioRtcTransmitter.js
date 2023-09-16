import { ep } from "./index";

const sdpTransform = require('sdp-transform');
const goodOpusSettings = "minptime=10;useinbandfec=1;maxplaybackrate=48000;stereo=1;maxaveragebitrate=510000";

const ICE_SERVERS = [{
  username: 'echo',
  credential: 'echo123',
  urls: ["turn:turn.kuricki.com:6984"]
}];

/**
 * @class audioRtcTransmitter
 * @classdesc A class that handles the audio transmission
 * @param {string} id - The id of the user
 * @param {string} deviceId - The id of the audio device
 * @param {float} volume - The volume of the audio
 */
class audioRtcTransmitter {
  constructor(id, deviceId = 'default', outputDeviceId = 'default', volume = 1.0) {
    this.id = id;
    this.peer = null;
    this.stream = null;
    this.deviceId = deviceId;
    this.outputDeviceId = outputDeviceId;
    this.isTransmitting = false;
    this.isMuted = false;
    this.isDeaf = false;
    this.volume = volume;
    this.gainNode = null;
    this.context = null;
    this.inputStreams = [];
    this.streamIds = new Map();

    //Audio only constraints
    this.constraints = {
      audio: {
        channelCount: 2,
        sampleRate: 48000,
        sampleSize: 16,
        volume: 1.0,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        deviceId: this.deviceId,
      },
      video: false,
    }
  }

  /**
   * @function init - Starts the audio transmission
   */
  async init() {
    //Create stream
    this.stream = await navigator.mediaDevices.getUserMedia(this.constraints, err => {console.error(err); return;});
    //Setup the volume stuff
    const context = new AudioContext();
    const source = context.createMediaStreamSource(this.stream);
    const destination = context.createMediaStreamDestination();
    this.gainNode = context.createGain();
    source.connect(this.gainNode);
    this.gainNode.connect(destination);
    //Set the volume
    this.setVolume(this.volume);
    //Create the peer
    this.peer = this.createPeer();
    //Add the tracks
    destination.stream.getTracks().forEach(track => this.peer.addTrack(track, destination.stream));
    this.isTransmitting = true;
    this.subscribedUsers = 0;
  }

  /**
   * @function setVolume - Sets the volume of the audio
   * @param {float} volume 
   */
  setVolume(volume) {
    if (volume > 1.0 || volume < 0.0) {
      console.error("Volume must be between 0.0 and 1.0", volume);
      volume = 1.0;
    }

    this.volume = volume;
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }

  async setInputDevice(deviceId) {
    this.deviceId = deviceId;
    this.constraints.audio.deviceId = deviceId;

    let newStream = await navigator.mediaDevices.getUserMedia(this.constraints, err => {console.error(err); return;});
    this.peer.getSenders().forEach((sender) => {
      if (sender.track.kind === 'audio') {
        sender.replaceTrack(newStream.getAudioTracks()[0]);
      }
    });
    
    this.stream = newStream;
  }

  setOutputDevice(deviceId) {
    if (deviceId === 'default') {
      return
    }

    this.outputDeviceId = deviceId;
    this.inputStreams.forEach((stream) => {
      stream.context.setSinkId(deviceId);
    });
  }

  setOutputVolume(volume) {
    if (volume > 1.0 || volume < 0.0) {
      console.error("Volume must be between 0.0 and 1.0", volume);
      volume = 1.0;
    }

    this.inputStreams.forEach((stream) => {
      stream.gainNode.gain.value = volume;
    });
  }

  setPersonalVolume(volume, id) {
    if (volume > 1.0 || volume < 0.0) {
      console.error("Volume must be between 0.0 and 1.0", volume);
      volume = 1.0;
    }

    this.inputStreams.filter((stream) => {
      return stream.stream.id === this.streamIds.get(id);
    }).forEach((stream) => {
      stream.personalGainNode.gain.value = volume;
    });
  }

  mute() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.enabled = false);
      this.isMuted = true;
    }
  }

  unmute() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.enabled = true);
      this.isMuted = false;
    }
  }

  deaf() {
    if (this.inputStreams) {
      this.inputStreams.forEach(inputStream => {
        inputStream.stream.getTracks().forEach(track => track.enabled = false);
      });
      this.isDeaf = true;
    }
  }

  undeaf() {
    if (this.inputStreams) {
      this.inputStreams.forEach(inputStream => {
        inputStream.stream.getTracks().forEach(track => track.enabled = true);
      });
      this.isDeaf = false;
    }
  }

  handleTrackEvent(e) {
    console.log("Got audio track event", e);
    let context = new AudioContext();

    if (this.outputDeviceId !== 'default' && this.outputDeviceId) {
      context.setSinkId(this.outputDeviceId);
    }

    let source = context.createMediaStreamSource(e.streams[0]);
    let destination = context.destination;

    let personalGainNode = context.createGain();
    let gainNode = context.createGain();
    let muteNode = context.createGain();

    source.connect(personalGainNode);
    personalGainNode.connect(gainNode);
    gainNode.connect(muteNode);
    muteNode.connect(destination);

    context.resume();

    //Chrome bug fix

    let audioElement = new Audio();
    audioElement.srcObject = e.streams[0];
    audioElement.autoplay = true;
    audioElement.pause();

    this.inputStreams.push({
      stream: e.streams[0],
      source: source,
      context: context,
      gainNode: gainNode,
      muteNode: muteNode,
      personalGainNode: personalGainNode,
      audioElement: audioElement,
    });
  }

  isFullyConnected() {
    return(this.subscribedUsers === this.inputStreams.length);
  }

  addCandidate(candidate) {
    if (this.peer) {
      this.peer.addIceCandidate(candidate);
    }
  }

  /**
   * @function createPeer - Creates the peer connection
   * @returns {RTCPeerConnection} peer - The peer connection
   */
  createPeer() {
    const peer = new RTCPeerConnection({
      iceServers: ICE_SERVERS
    });
    //Handle the ice candidates
    peer.onnegotiationneeded = () => { this.handleNegotiationNeededEvent(peer) };

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        ep.sendIceCandidate({
          candidate: e.candidate,
          id: this.id,
        });
      }
    }

    peer.ontrack = (e) => { this.handleTrackEvent(e) };
    peer.onconnectionstatechange = () => {
      ep.rtcConnectionStateChange({
        state: peer.connectionState,
      });
      if (peer.connectionState === 'failed') {
        peer.restartIce();
      }
    }

    peer.oniceconnectionstatechange = () => {
      if (peer.iceconnectionState === 'failed') {
        peer.restartIce()
      }
    }

    return peer;
  }

  async subscribeToAudio(id) {
    ep.subscribeAudio({
      senderId: id,
      receiverId: this.id,
    }, (a) => {
      if (a) {
        //The socket returns the audio stream id
        this.streamIds.set(id, a);
        this.subscribedUsers++;
      } else {
        console.error("Failed to subscribe to audio");
        return;
      }
    });
  }

  unsubscribeFromAudio(id = null) {
    if (id) {
      //find the stream id
      let streamId = this.streamIds.get(id);
      if (streamId) {
        ep.unsubscribeAudio({ senderId: id, receiverId: this.id })
        this.inputStreams.filter((stream) => {
          // if (!stream) return false;
          // if (!stream.stream) return false;
          //find every stream that matches the id
          return stream.stream.id === streamId;
        }).forEach((stream) => {
          //close it
          stream.stream.getTracks().forEach(track => track.stop());
          stream.stream = null;
          stream.context.close();
          stream.audioElement.pause();
          stream.audioElement = null;
          this.inputStreams.splice(this.inputStreams.indexOf(stream), 1);
          this.subscribedUsers--;
        });
      }
    } else {
      //unsubscribe from all streams
      for (const [key, value] of this.streamIds) {
        ep.unsubscribeAudio({ senderId: key, receiverId: this.id })
      }
      this.inputStreams.forEach((stream) => {
        if(stream.stream){
          stream.stream.getTracks().forEach(track => track.stop());
          stream.stream = null;
          stream.context.close();
          stream.audioElement.pause();
          stream.audioElement = null;
        }
      });
      this.inputStreams = [];
      this.subscribedUsers = 0;

    }
  }


  /**
   * @function handleNegotiationNeededEvent - Handles the negotiation needed event
   * @param {RTCPeerConnection} peer 
   */
  async handleNegotiationNeededEvent(peer) {
    const offer = await peer.createOffer();
    let parsed = sdpTransform.parse(offer.sdp);

    //Edit the sdp to make the audio sound better
    parsed.media[0].fmtp[0].config = goodOpusSettings;
    offer.sdp = sdpTransform.write(parsed);

    await peer.setLocalDescription(offer);

    ep.broadcastAudio({
      sdp: peer.localDescription,
      id: this.id
    }, (description) => {
      const desc = new RTCSessionDescription(description);
      peer.setRemoteDescription(desc).catch(e => console.error(e));
    })
  }

  async renegotiate(remoteOffer, cb) {
    const remoteDesc = new RTCSessionDescription(remoteOffer);
    this.peer.setRemoteDescription(remoteDesc).then(() => {
      this.peer.createAnswer().then((answer) => {
        let parsed = sdpTransform.parse(answer.sdp);
        parsed.media[0].fmtp[0].config = goodOpusSettings;
        answer.sdp = sdpTransform.write(parsed);

        this.peer.setLocalDescription(answer).then(() => {
          cb(this.peer.localDescription);
        });
      });
    });
  }

  /**
   * @function close - Closes the transmissionroomCli
   */
  close() {
    //Closes the transmission
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    } else {
      console.warn("Stream is null")
    }

    if (this.peer) {
      this.peer.close();
      this.peer = null;
    } else {
      console.warn("Peer is null")
    }

    ep.stopAudioBroadcast({ id: this.id });

    this.isTransmitting = false;
  }

  async getConnectionStats() {
    return new Promise((resolve, reject) => {
      let ping = 0;
      let bytesSent = 0;
      let bytesReceived = 0;
      let packetsSent = 0;
      let packetsReceived = 0;
      let jitterIn = 0;
      let packetsLostIn = 0;

      let stats = this.peer.getStats();
      stats.then((res) => {
        res.forEach((report) => {
          if (report.type === "candidate-pair" && report.nominated) {
            ping = report.currentRoundTripTime * 1000;
            bytesSent = report.bytesSent;
            bytesReceived = report.bytesReceived;
            packetsSent = report.packetsSent;
            packetsReceived = report.packetsReceived;
          }

          if (report.type === "remote-inbound.rtp" && report.kind === "audio") {
            jitterIn = report.jitter * 1000;
            packetsLostIn = report.packetsLost;
          }
        });
        resolve({
          ping: ping,
          bytesSent: bytesSent,
          bytesReceived: bytesReceived,
          packetsSent: packetsSent,
          packetsReceived: packetsReceived,
          jitterIn: jitterIn,
          packetsLostIn: packetsLostIn,
        })
      });
    });
  }

  /**
   * @function getAudioDevices - Gets the audio devices
   * @returns {Promise} - The promise that resolves when the audio devices are found
   */
  static async getInputAudioDevices() {
    //Gets the audio devices
    return new Promise((resolve, reject) => {
      var out = [];
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        devices.forEach((device, id) => {
          if (device.kind === "audioinput" && device.deviceId !== "communications" && device.deviceId !== "default") {
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

  static async getOutputAudioDevices() {
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

  getAudioState() {
    return {
      isTransmitting: this.isTransmitting,
      isMuted: this.isMuted,
      isDeaf: this.isDeaf,
      volume: this.volume,
      deviceId: this.deviceId,
      outputDeviceId: this.outputDeviceId,
    }
  }
}

export default audioRtcTransmitter;