const User = require("./users");
const mediasoup = require("mediasoup");
const Colors = require("./colors");
const colors = new Colors();

const codecs = [{
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    parameters: {
        useinbandfec: 1,
        minptipe: 10,
        maxaveragebitrate: 510000,
        stereo: 1,
        maxplaybackrate: 48000
    }
},
{
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
        "packetization-mode": 1,
        "profile-level-id": "42e01f",
        "level-asymmetry-allowed": 1
    }
}];

class Rooms {
    constructor(io, socket) {
        this.emitter = io;
        this.rooms = new Map();
        this.connectedClients = new Map();
        this.userListeners = new Map();
        this.socket = null;
        this.worker = null;

        console.log(colors.changeColor("green", "Listening for new client connections"));

        mediasoup.createWorker({
            logLevel: 'debug',
            logTags: [
                'info',
                'ice',
                'dtls',
                'rtp',
                'srtp',
                'rtcp'
            ],
            rtcMinPort: 40000,
            rtcMaxPort: 49999
        }).then((worker) => {
            this.worker = worker;
            console.log(colors.changeColor("cyan", "Mediasoup worker created with pid " + this.worker.pid));

            this.worker.on('died', (e) => {
                console.log(colors.changeColor("red", "Mediasoup worker died\n" + e));
            });

            this.worker.observer.on('close', () => {
                console.log(colors.changeColor("red", "Mediasoup worker closed"));
            });

            this.worker.observer.on('newrouter', (router) => {
                console.log(colors.changeColor("cyan", "Mediasoup router created with id " + router.id));
            });
        });


        this.emitter.on('connection', (socket) => {
            const request = socket.request;
            const id = request._query["id"];
            if (!id) return reject("no-id-in-query");
            if (this.connectedClients.has(id)) {
                //get the user
                const user = this.connectedClients.get(id);
                user.clearTransports();
            }

            const newUser = new User(socket, id);
            this.connectedClients.set(id, newUser);
            console.log(colors.changeColor("yellow", "New socket connection from client " + id));
            this.registerClientEvents(newUser);
        });
    }

    registerClientEvents(user) {
        user.registerEvent("join", (data) => {
            this.joinRoom(data);
        });
        user.registerEvent("end", (data) => {
            this.endConnection(data);
        });
        user.registerEvent("audioState", (data) => {
            this.sendAudioState(data);
        });
        user.registerEvent("sendChatMessage", (data) => {
            this.sendChatMessage(data);
        });
        user.registerEvent("exit", (data) => {
            this.exitRoom(data);
        });
        user.registerEvent("updateUser", (data) => {
            this.updateUser(data);
        });
        user.registerEvent("videoBroadcastStarted", (data) => {
            this.videoBroadcastStarted(data);
        });
        user.registerEvent("videoBroadcastStop", (data) => {
            this.videoBroadcastStop(data);
        });
        user.registerEvent("userFullyConnectedToRoom", (data) => {
            this.userFullyConnectedToRoom(data);
        });
    }

    updateUser(data) {
        if (this.connectedClients.has(data.id)) {
            this.connectedClients.forEach((user, _) => {
                if (data.id !== user.id) {
                    user.userUpdated(data);
                }
            });
        }
    }

    userFullyConnectedToRoom(a) {
        //Notify all users
        this.connectedClients.forEach((user, _) => {
            if (a.id !== user.id) {
                const userRoom = user.getCurrentRoom();
                a.isConnected = userRoom === a.roomId;
                user.userJoinedChannel({
                    id: a.id,
                    roomId: a.roomId,
                    muted: a.muted,
                    deaf: a.deaf,
                    isConnected: a.isConnected,
                });
            }
        })

        let newUser = this.connectedClients.get(a.id);
        this.getUsersInRoom(a.roomId).forEach((user, id) => {
            if (newUser.id !== user.id) {
                const userRoom = user.getCurrentRoom();
                const isBroadcatingVideo = user.isBroadcastingVideo;
                let isConnected = userRoom === newUser.getCurrentRoom();
                let audioState = user.getAudioState();
                newUser.userJoinedChannel({
                    id: user.id,
                    roomId: a.roomId,
                    isConnected: isConnected,
                    deaf: audioState.deaf,
                    muted: audioState.muted,
                    broadcastingVideo: isBroadcatingVideo
                });
            }
        });
    }

    videoBroadcastStarted(data) {
        if (this.connectedClients.has(data.id)) {
            this.connectedClients.forEach((user, _) => {
                user.videoBroadcastStarted(data);
            });
        }
    }

    videoBroadcastStop(data) {
        if (this.connectedClients.has(data.id)) {
            this.connectedClients.forEach((user, _) => {
                user.videoBroadcastStop(data);
            });
        }
    }

    sendChatMessage(data) {
        if (this.connectedClients.has(data.id)) {
            data.roomId = Number(data.roomId);
            const room = this.rooms.get(data.roomId);
            if (room) {
                room.users.forEach((user, id) => {
                    user.receiveChatMessage(data);
                });
            }
        }
    }

    sendAudioState(data) {
        if (this.connectedClients.has(data.id)) {
            const user = this.connectedClients.forEach((user, id) => {
                if (String(id) !== String(data.id))
                    user.sendAudioState(data);
            });
        }
    }

    async joinRoom(data) {
        await this.addRoom(data.roomId);
        this.addUserToRoom(data);
    }

    endConnection(data) {
        this.removeUserFromRooms(data.id);
        this.connectedClients.forEach((user, _) => {
            if (data.id !== user.id) {
                user.endConnection(data);
            }
        });
        this.connectedClients.delete(data.id);
    }

    async addRoom(id) {
        if (!this.rooms.has(id)) {
            let r = await this.worker.createRouter({ mediaCodecs: codecs, appData: { roomId: id } });
            r.observer.on('close', () => {
                console.log(colors.changeColor("cyan", "[R-" + r.id + "] Mediasoup router closed"));
            });

            r.observer.on('newtransport', (transport) => {
                console.log(colors.changeColor("cyan", "[R-" + r.id + "] Mediasoup transport created with id " + transport.id));
            });

            this.rooms.set(id, {
                id,
                private: false,
                users: new Map(),
                password: null,
                display: "New room",
                mediasoupRouter: r
            });
        }
    }

    removeUserFromRooms(id) {
        if (this.connectedClients.has(id)) {
            this.rooms.forEach((room, _, arr) => {
                if (room.users.has(id)) {
                    room.users.delete(id);
                }
            });
        }
    }

    exitRoom(data) {
        if (this.connectedClients.has(data.id)) {
            const user = this.connectedClients.get(data.id);
            const roomId = user.getCurrentRoom();
            if (this.rooms.has(roomId)) {
                this.connectedClients.forEach((user, _) => {
                    if (data.id !== user.id) {
                        const userRoom = user.getCurrentRoom();
                        const isConnected = userRoom === roomId;
                        user.userLeftCurrentChannel({ id: data.id, roomId: roomId, isConnected });
                    }
                })

                //clear all transports
                user.clearTransports();
                const room = this.rooms.get(roomId);
                room.users.delete(data.id);
            }
        }
    }

    /**
     * 
     * @param {*} id User joining the room
     * @param {*} roomId 
     */
    addUserToRoom(data) {
        const id = data.id;
        const roomId = data.roomId;
        if (this.connectedClients.has(id)) {
            if (this.rooms.has(roomId)) {
                const user = this.connectedClients.get(id);
                user.setCurrentRoom(roomId);
                this.rooms.get(roomId).users.set(user.id, user);

                let newUser = this.connectedClients.get(id);
                let router = this.rooms.get(roomId).mediasoupRouter;
                //Create receive transport
                router.createWebRtcTransport({
                    listenIps: [
                        {
                            ip: '0.0.0.0',
                            announcedIp: 'echo.kuricki.com'
                        },
                    ],
                    enableUdp: true,
                    enableTcp: true,
                    preferUdp: true,
                    appData: { peerId: newUser.id }
                }).then((transport) => {
                    newUser.setReceiveTransport(transport, router.rtpCapabilities);
                });

                //Create sender transport
                router.createWebRtcTransport({
                    listenIps: [
                        {
                            ip: '0.0.0.0',
                            announcedIp: 'echo.kuricki.com'
                        },
                    ],
                    enableUdp: true,
                    enableTcp: true,
                    preferUdp: true,
                    appData: { peerId: newUser.id }
                }).then((transport) => {
                    newUser.setSendTransport(transport, router.rtpCapabilities);
                });

                //Create video receive transport
                router.createWebRtcTransport({
                    listenIps: [
                        {
                            ip: '0.0.0.0',
                            announcedIp: 'echo.kuricki.com'
                        },
                    ],
                    enableUdp: true,
                    enableTcp: true,
                    preferUdp: true,
                    appData: { peerId: newUser.id }
                }).then((transport) => {
                    newUser.setReceiveVideoTransport(transport, router.rtpCapabilities);
                });

                //Create video sender transport
                router.createWebRtcTransport({
                    listenIps: [
                        {
                            ip: '0.0.0.0',
                            announcedIp: 'echo.kuricki.com'
                        },
                    ],
                    enableUdp: true,
                    enableTcp: true,
                    preferUdp: true,
                    appData: { peerId: newUser.id }
                }).then((transport) => {
                    newUser.setSendVideoTransport(transport, router.rtpCapabilities);
                });
            }
        } else console.log(colors.changeColor("red", "Can't add user " + id + " to room " + roomId + ", user is not connected to socket"));
    }

    getUsersInRoom(id) {
        if (this.rooms.has(id)) return this.rooms.get(id).users;
    }
}

module.exports = Rooms;