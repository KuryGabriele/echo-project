const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require('wrtc');

const stunkStunkServer = 'stun:stun.l.google.com:19302'

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let senderStreams = [];
let senders = [];

let rooms = [];
let audioUsers = [];
let audioStreams = [];

app.post('/consumer/:senderId/:receiverId', async ({body}, res ) => {
    const { senderId, receiverId } = req.params;

    if (!senderId || !receiverId) {
        return res.status(400).json({ message: "Provide a valid sender and receiver id" });
    }

    //if senderId is not in senders
    if (!senders.includes(senderId)) {
        return res.status(404).json({ message: "Stream not found" });
    }

    const peer = new webrtc.RTCPeerConnection({
        iceServers: [
            {
                urls: stunkStunkServer
            }
        ]
    });

    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
    //get index of senderId
    const index = senders.indexOf(senderId);
    console.log("User " + receiverId + " connected to user " + senderId + "'s stream");
    senderStreams[index].getTracks().forEach(track => peer.addTrack(track, senderStreams[index]));

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    const payload = {
        sdp: peer.localDescription
    } 

    res.json(payload);
});

app.post('/broadcast/:id', async ({body}, res ) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ message: "Provide a valid id" });
    }

    const peer = new webrtc.RTCPeerConnection({
        iceServers: [
            {   
                urls: stunkStunkServer
            }
        ]
    });

    peer.ontrack = (e) => handleTrackEvent(e, peer, id);
    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    const payload = {
        sdp: peer.localDescription
    }

    res.json(payload);
});

function handleTrackEvent(e, peer, id) {
    console.log("User " + id + " is broadcasting their stream")
    //if id is not in senders, add it
    if (!senders.includes(id)) {
        senders.push(id);
        senderStreams.push(e.streams[0]);
    } else {
        //if id is in senders, replace the stream
        const index = senders.indexOf(id);
        senderStreams[index] = e.streams[0];
    }
}

app.post('/subscribeAudio/:senderId/:receiverId', async ({body}, res ) => {
    const { senderId, receiverId } = req.params;

    if (!senderId || !receiverId) {
        return res.status(400).json({ message: "Provide a valid sender and receiver id" });
    }

    //if audioUsers is not in senders
    if (!audioUsers.includes(senderId)) {
        return res.status(404).json({ message: "Stream not found" });
    }

    const peer = new webrtc.RTCPeerConnection({
        iceServers: [
            {
                urls: stunkStunkServer
            }
        ]
    });

    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
    //get index of senderId
    const index = audioUsers.indexOf(senderId);
    console.log("User " + receiverId + " connected to user " + senderId + "'s audio stream");
    audioStreams[index].getTracks().forEach(track => peer.addTrack(track, audioStreams[index]));

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    const payload = {
        sdp: peer.localDescription
    } 

    res.json(payload);
});

app.post('/broadcastAudio/:id/', async ({body}, res ) => {
    const { id } = req.params;
    console.log("id: ");
    console.log(id);
    if (!id) {
        return res.status(400).json({ message: "Provide a valid" });
    }

    const peer = new webrtc.RTCPeerConnection({
        iceServers: [
            {   
                urls: stunkStunkServer
            }
        ]
    });

    peer.ontrack = (e) => handleAudioTrackEvent(e, peer, id, room);
    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    const payload = {
        sdp: peer.localDescription
    }

    res.json(payload);
});

function handleAudioTrackEvent(e, peer, id) {
    console.log("User " + id + " is broadcasting audio");
    //if id not in audioUsers, add it
    if (!audioUsers.includes(id)) {
        audioUsers.push(id);
        audioStreams.push(e.streams[0]);
    } else {
        //if id is in audioUsers, replace the stream
        const index = audioUsers.indexOf(id);
        audioStreams[index] = e.streams[0];
    }
}

app.use((req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
});

app.listen(6983, () => console.log('Server started'));