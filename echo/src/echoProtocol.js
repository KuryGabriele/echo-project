import mediasoupHandler from "./mediasoupHandler";
import Emitter from "wildemitter";

import Users from "./cache/user";
import Room from "./cache/room";
import Friends from "./cache/friends";
import wsConnection from "./wsConnection";

import { storage } from "./index";

class EchoProtocol {
  constructor() {
    this.wsConnection = new wsConnection();
    this.ping = 0;
    this.pingInterval = null;
    this.mh = null;
    this.id = null;

    this.cachedUsers = new Users();
    this.cachedRooms = new Map();
    this.cachedFriends = new Friends();

    this.currentConnectionState = "";
    this.currentConnectionStateInterval = null;

    this.mh = new mediasoupHandler(
      storage.get('inputAudioDeviceId'),
      storage.get('outputAudioDeviceId'),
      storage.get('micVolume'),
      storage.get('noiseSuppression') === 'true' || false,
      storage.get('echoCancellation') === 'true' || false,
      storage.get('autoGainControl') === 'true' || false,
    );

    this.mh.init();

    this.SERVER_URL = "https://echo.kuricki.com";
  }

  wsConnectionClosed() {
    this.rtcConnectionStateChange({ state: "disconnected" });
    this.localUserCrashed({ id: sessionStorage.getItem("id") });
  }

  wsConnectionError(error) {
    console.error(error);
    alert("Can't conect to the server! \nCheck your internet connection (or the server is down). \n\nIf your internet connection is working try pinging echo.kuricki.com, if it doesn't respond, contact Kury or Thundy :D");
    this.stopTransmitting();
    this.stopReceiving();
    if (this.wsConnection) {
      this.wsConnection.close();
    }

    this.rtcConnectionStateChange({ state: "disconnected" });
    this.localUserCrashed({ id: sessionStorage.getItem("id") });
  }

  wsUserJoinedChannel(data) {
    data.roomId = data.roomId.slice(0, data.roomId.lastIndexOf('@'));
    console.log(data);
    if (data.isConnected) this.startReceiving(data.id);
    this.updateUser({ id: data.id, field: "currentRoom", value: data.roomId });
    this.updateUser({ id: data.id, field: "muted", value: data.muted });
    this.updateUser({ id: data.id, field: "deaf", value: data.deaf });
    this.updateUser({ id: data.id, field: "broadcastingVideo", value: data.broadcastingVideo });
    if (data.broadcastingVideo) {
      this.videoBroadcastStarted({ id: data.id, streamId: null });
    }
    this.userJoinedChannel(data);
  }

  wsUserLeftChannel(data) {
    if (data.crashed) {
      console.log("User " + data.id + " crashed");
    }

    if (data.isConnected) this.stopReceiving(data.id);
    this.userLeftChannel(data);
  }

  wsSendAudioState(data) {
    if (!data.deaf || !data.mute) {
      this.updatedAudioState(data);
    }
  }

  wsUserUpdated(data) {
    this.updateUser(data);
    // update rooms cache chat with new user data
    const rooms = this.cachedRooms.values();
    for (const room of rooms) {
      room.chat.updateUser(data);
      if (room.id === this.cachedUsers.get(sessionStorage.getItem("id")).currentRoom) this.messagesCacheUpdated(room.chat.get());
    }
    this.usersCacheUpdated(this.cachedUsers.get(this.id));
  }

  wsVideoBroadcastStarted(data) {
    this.updateUser({ id: data.id, field: "broadcastingVideo", value: true });
    this.videoBroadcastStarted(data);
  }

  wsVideoBroadcastStop(data) {
    this.updateUser({ id: data.id, field: "broadcastingVideo", value: false });
    this.videoBroadcastStop(data);
  }

  wsReceiveTransportCreated(data) {
    if (this.mh) {
      //Server will receive and what client sends
      this.mh.createSendTransport(data);
    }
  }

  wsSendTransportCreated(data) {
    if (this.mh) {
      //Client will receive and what server sends
      this.mh.createReceiveTransport(data);
    }
  }

  wseReceiveVideoTransportCreated(data) {
    if (this.mh) {
      //Server will receive and what client sends
      this.mh.createSendVideoTransport(data);
    }
  }

  wsSendVideoTransportCreated(data) {
    if (this.mh) {
      //Client will receive and what server sends
      this.mh.createReceiveVideoTransport(data);
    }
  }

  wsFriendAction(data) {
    if (data.operation === "add") {
      this.addFriend(data);
    } else if (data.operation === "remove") {
      this.removeFriend(data);
    }
  }

  getPing() {
    return new Promise((resolve, reject) => {
      if (this.mh) {
        this.mh.getConnectionStats().then(stats => {
          resolve(stats.ping);
        });
      }
    });
  }

  openConnection(id) {
    this.id = id;
    if (!this.wsConnection) {
      this.wsConnection = new wsConnection();
    }
    this.wsConnection.connect(storage.get('token'));
    this.startTransmitting(id);
  }

  endConnection(data) {
    // this.cachedUsers.delete(data.id);
    this.userLeftChannel(data);
  }

  wsReceiveChatMessage(data) {
    console.log("wsReceiveChatMessage", data)
    if (typeof data.room !== "string") data.room = data.room.toString();
    if (typeof data.id !== "string") data.id = data.id.toString();
    if (typeof data.userId !== "string") data.userId = data.id;

    // check if the room is cached
    const room = this.cachedRooms.get(data.room);
    if (room) {
      const user = this.cachedUsers.get(data.id);
      if (user) {
        data.userId = user.id;
        data.img = user.userImage;
        data.name = user.name;
        const newMessage = room.chat.add(data);
        newMessage.roomId = data.room;
        this.receiveChatMessage(newMessage);
      }
      else this.needUserCacheUpdate({ id: data.id, call: { function: "wsReceiveChatMessage", args: data } });
    } else console.error("Room not found in cache");
  }

  async startTransmitting(id) {
    if (this.mh) {
      this.stopTransmitting();
    }

    this.mh = new mediasoupHandler(
      id,
      storage.get('inputAudioDeviceId'),
      storage.get('outputAudioDeviceId'),
      storage.get('micVolume'),
      storage.get('noiseSuppression') === 'true' || false,
      storage.get('echoCancellation') === 'true' || false,
      storage.get('autoGainControl') === 'true' || false,
    );
    await this.mh.init();
  }

  stopTransmitting() {
    if (this.mh) {
      this.mh.close();
    }
  }

  sendTransportConnect(data, cb, errCb) {
    if (this.wsConnection) {
      this.wsConnection.send("sendTransportConnect", data, (a) => {
        cb(a);
      });
    }
  }

  sendTransportProduce(data, cb, errCb) {
    if (this.wsConnection) {
      this.wsConnection.send("sendTransportProduce", data, (a) => {
        cb(a);
      });
    }
  }

  receiveTransportConnect(data, cb, errCb) {
    if (this.wsConnection) {
      this.wsConnection.send("receiveTransportConnect", data, (a) => {
        cb(a);
      });
    }
  }

  sendVideoTransportConnect(data, cb, errCb) {
    if (this.wsConnection) {
      this.wsConnection.send("sendVideoTransportConnect", data, (a) => {
        cb(a);
      });
    }
  }

  sendVideoTransportProduce(data, cb, errCb) {
    if (this.wsConnection) {
      this.wsConnection.send("sendVideoTransportProduce", data, (a) => {
        cb(a);
      });
    }
  }

  sendVideoAudioTransportProduce(data, cb, errCb) {
    if (this.wsConnection) {
      this.wsConnection.send("sendVideoAudioTransportProduce", data, (a) => {
        cb(a);
      });
    }
  };

  sendVideoAudioTransportConnect(data, cb, errCb) {
    if (this.wsConnection) {
      this.wsConnection.send("sendVideoAudioTransportConnect", data, (a) => {
        cb(a);
      });
    }
  }

  receiveVideoTransportConnect(data, cb, errCb) {
    if (this.wsConnection) {
      this.wsConnection.send("receiveVideoTransportConnect", data, (a) => {
        cb(a);
      });
    }
  }

  receiveVideoAudioTransportConnect(data, cb, errCb) {
    if (this.wsConnection) {
      this.wsConnection.send("receiveVideoAudioTransportConnect", data, (a) => {
        cb(a);
      });
    }
  }

  startReceiving(remoteId) {
    this.subscribeAudio({ id: remoteId });
  }

  stopReceiving(remoteId) {
    if (this.mh) {
      this.mh.stopConsuming(remoteId);
    }
  }

  stopReceivingVideo(remoteId) {
    if (this.mh) {
      this.mh.stopConsumingVideo(remoteId);
      if (this.wsConnection) {
        this.wsConnection.send("stopReceivingVideo", { id: remoteId });
      }
    }
  }

  toggleMute(mutestate) {
    if (this.mh) {
      if (mutestate) return this.mh.mute();
      this.mh.unmute();
    }
  }

  toggleDeaf(deafstate) {
    if (this.mh) {
      if (deafstate) return this.mh.deaf();
      this.mh.undeaf();
    }
  }

  setSpeakerDevice(deviceId) {
    this.mh.setSpeakerDevice(deviceId);
  }

  setSpeakerVolume(volume) {
    this.mh.setSpeakerVolume(volume);
  }

  setMicrophoneDevice(deviceId) {
    if (this.mh) {
      this.mh.setInputDevice(deviceId);
    }
  }

  setEchoCancellation(value) {
    if (this.mh) {
      this.mh.setEchoCancellation(value);
    }
  }

  setNoiseSuppression(value) {
    if (this.mh) {
      this.mh.setNoiseSuppression(value);
    }
  }

  setAutoGainControl(value) {
    if (this.mh) {
      this.mh.setAutoGainControl(value);
    }
  }

  setMicrophoneVolume(volume) {
    if (this.mh) {
      this.mh.setOutVolume(volume);
    }
  }

  setVadTreshold(treshold) {
    if (this.mh) {
      this.mh.setVadTreshold(treshold);
    }
  }

  setMicrophoneTest(value) {
    if (this.mh) {
      this.mh.setMicrophoneTest(value);
    }
  }

  setUserVolume(volume, remoteId) {
    this.mh.setPersonalVolume(remoteId, volume);
  }

  getSpeakerDevices() {
    return mediasoupHandler.getOutputAudioDevices();
  }

  getMicrophoneDevices() {
    return mediasoupHandler.getInputAudioDevices();
  }

  joinRoom(id, roomId) {
    const audioState = this.getAudioState();
    this.mh.startStatsInterval();
    // join the transmission on current room
    if (this.wsConnection) {
      this.wsConnection.send("join", {
        serverId: storage.get('serverId'),
        id,
        roomId,
        deaf: audioState.isDeaf,
        muted: audioState.isMuted
      });
    }
    this.joinedRoom();
  }

  sendAudioState(id, data) {
    this.updatedAudioState({ id, deaf: data.deaf, muted: data.muted });
    if (this.wsConnection) {
      this.wsConnection.send("audioState", {
        id,
        deaf: data.deaf,
        muted: data.muted
      });
    }
  }

  exitFromRoom(id) {
    this.stopScreenSharing();
    this.stopReceiving();
    this.stopReceivingVideo();
    this.mh.leaveRoom();
    this.exitedFromRoom();
    if (this.wsConnection) {
      this.wsConnection.send("exit", { id });
    }
  }

  closeConnection(id = null) {
    if (this.wsConnection) {
      if (!id) id = sessionStorage.getItem('id');
      this.wsConnection.send("end", { id });
      clearInterval(this.currentConnectionStateInterval);
    }

    this.stopReceiving();
    this.stopReceivingVideo();
    this.stopTransmitting();
    this.stopScreenSharing();

    this.wsConnection = null;
    this.ping = 0;
    this.pingInterval = null;
    this.mh = new mediasoupHandler(
      storage.get('inputAudioDeviceId'),
      storage.get('outputAudioDeviceId'),
      storage.get('micVolume'),
      storage.get('noiseSuppression') === 'true' || false,
      storage.get('echoCancellation') === 'true' || false,
      storage.get('autoGainControl') === 'true' || false,
    );

    this.cachedUsers = new Users();
    this.cachedRooms = new Map();

    this.currentConnectionState = "";
    this.currentConnectionStateInterval = null;

    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    clearInterval(this.pingInterval);
  }

  broadcastAudio(data, cb) {
    if (this.wsConnection) {
      this.wsConnection.send("broadcastAudio", data, (description) => {
        cb(description);
      });
    }
  }

  streamChanged(data) {
    if (this.wsConnection) {
      this.wsConnection.send("streamChanged", data);
    }
  }

  videoStreamChanged(data) {
    if (this.wsConnection) {
      this.wsConnection.send("videoStreamChanged", data);
    }
  }

  subscribeAudio(data) {
    if (this.wsConnection) {
      let remoteId = data.id;
      let a = this.mh.getRtpCapabilities()

      this.wsConnection.send("subscribeAudio", { id: remoteId, rtpCapabilities: a }, (data) => {
        this.mh.consume({
          id: data.id,
          producerId: data.producerId,
          kind: data.kind,
          rtpParameters: data.rtpParameters,
          type: data.type,
          producerPaused: data.producerPaused,
        });
      });
    }
  }
  resumeStream(data) {
    if (this.wsConnection) {
      this.wsConnection.send("resumeStream", data);
    }
  }

  resumeStreams(data) {
    if (this.wsConnection) {
      this.wsConnection.send("resumeStreams", data);
    }
  }

  unsubscribeAudio(data, cb) {
    if (this.wsConnection) {
      this.wsConnection.send("unsubscribeAudio", data);
    }
  }

  stopAudioBroadcast(data) {
    if (this.wsConnection) {
      this.wsConnection.send("stopAudioBroadcast", data);
    }
  }

  startScreenSharing(deviceId) {
    if (this.mh) {
      this.mh.setScreenShareDevice(deviceId);
      this.mh.startScreenShare();
    }
  }

  stopScreenSharing() {
    const id = sessionStorage.getItem("id");
    if (!id) return console.error("No id found in session storage");
    this.updateUser({ id, field: "screenSharing", value: false });
    if (this.mh && this.mh.isScreenSharing()) {
      this.mh.stopScreenShare();
      if (this.wsConnection) {
        this.wsConnection.send("stopScreenSharing", { id });
      }
    }
  }

  startReceivingVideo(remoteId) {
    if (this.mh) {
      let a = this.mh.getRtpCapabilities()
      if (this.wsConnection) {
        this.wsConnection.send("startReceivingVideo", { id: remoteId, rtpCapabilities: a }, (description) => {
          this.mh.consumeVideo(description);
        });
      }
    }
  }

  resumeVideoStream(data) {
    if (this.wsConnection) {
      this.wsConnection.send("resumeVideoStream", data);
    }
  }

  /**
   * @param {string} remoteId Id from the user to get the video stream from
   * @returns {MediaStream} Screen share stream
   */
  getVideo(remoteId) {
    if (this.mh) {
      let stream = this.mh.getVideo(remoteId);
      return stream;
    } else {
      console.error("VideoRtc not initialized");
    }
  }

  sendVideoStreamToFrontEnd(data) {
    this.gotVideoStream({
      user: this.cachedUsers.get(data.id),
      stream: data.stream,
    })
  }

  stopVideoBroadcast(data) {
    if (this.wsConnection) {
      this.wsConnection.send("stopVideoBroadcast", data);
    }
  }

  unsubscribeVideo(data, cb) {
    if (this.wsConnection) {
      this.wsConnection.send("unsubscribeVideo", data, (description) => {
        cb(description);
      });
    }
  }

  getVideoDevices() {
    return mediasoupHandler.getVideoSources();
  }

  getAudioState(id = false) {
    if (id) {
      const cachedUser = this.cachedUsers.get(id);
      if (cachedUser && !cachedUser.self) {
        return {
          // TODO: implement user volume in cache
          isMuted: cachedUser.muted,
          isDeaf: cachedUser.deaf
        }
      }
    }
    if (this.mh) {
      return this.mh.getAudioState();
    }

    return {
      isMuted: false,
      isDeaf: false
    }
  }

  // cache rooms functions
  addRoom(room) {
    if (typeof room.id !== "string") room.id = room.id.toString();
    this.cachedRooms.set(room.id, new Room(room));
  }

  updateRoom(id, field, value) {
    const room = this.cachedRooms.get(id);
    if (room)
      if (room["update" + field]) room["update" + field](value);
      else console.error("Room does not have field " + field + " or field function update" + field);
    else console.error("Room not found in cache");
  }

  // cache users functions
  addUser(user, self = false) {
    console.log("adduser", user)
    this.cachedUsers.add(user, self);
    this.usersCacheUpdated(this.cachedUsers.get(user.id));
  }

  updatePersonalSettings({ id, field, value }) {
    if (this.cachedUsers.get(id)) {
      if (this.wsConnection) {
        this.wsConnection.send("updateUser", { id, field, value });
      }
      this.updateUser({ id, field, value });
    }
  }

  updateUser({ id, field, value }) {
    try {
      if (this.cachedUsers.get(id)) {
        this.cachedUsers.update(id, field, value);
        const rooms = this.cachedRooms.values();
        for (const room of rooms) {
          room.chat.updateUser({ id, field, value });
          if (room.id === this.cachedUsers.get(sessionStorage.getItem("id")).currentRoom) this.messagesCacheUpdated(room.chat.get());
        }
        this.usersCacheUpdated(this.cachedUsers.get(id));
      }
      else this.needUserCacheUpdate({ id, call: { function: "updateUser", args: { id, field, value } } });
    } catch (error) {
      console.error(id, field, value);
      console.error(error);
    }
  }

  addFriend(friend) {
    console.log("ep.addFriend", friend);
    if (typeof friend.targetId !== "string") friend.targetId = Number(friend.targetId);
    // populate info with cached user data
    if (!friend.name && !friend.img) {
      const user = this.cachedUsers.get(friend.targetId);
      friend.img = user.img || user.userImage;
      friend.name = user.name;
      friend.status = user.status;
      friend.online = user.online;
    }
    this.cachedFriends.add(friend);
    this.friendCacheUpdated(this.cachedFriends.getAll());
  }

  updateFriends({ id, field, value }) {
    this.cachedFriends.update(id, field, value);
    this.friendCacheUpdated(this.cachedFriends.getAll());
  }

  removeFriend(data) {
    console.log("ep.removeFriend", data);
    this.cachedFriends.remove(data.targetId);
    this.friendCacheUpdated(this.cachedFriends.getAll());
  }

  getFriend(id) {
    let friend = this.cachedFriends.get(id);
    let userFriend = this.cachedUsers.get(id);
    if (friend && userFriend) {
      return userFriend;
    } else {
      // this.needUserCacheUpdate({ id, call: { function: "getFriend", args: { id } } });
      console.warn("Friend not found in cache, probably offline and we don't handle it, ID:", id)
    }
  }

  getFriendStatus(id) {
    let f = this.cachedFriends.get(id);
    if (f) {
      if (f.requested && f.accepted) {
        return "friend"
      } else if (f.requested && !f.accepted) {
        return "requested"
      } else if (!f.requested && f.accepted) {
        return "pending"
      } else {
        return "no"
      }
    } else {
      return "no"
    }
  }

  getRoom(id) {
    if (typeof id !== "string") id = id.toString();
    return this.cachedRooms.get(id);
  }

  getUser(id) {
    if (id) {
      return this.cachedUsers.get(id);
    } else {
      return this.cachedUsers.get(sessionStorage.getItem("id"));
    }
  }

  getUsersInRoom(roomId) {
    return this.cachedUsers.getInRoom(roomId);
  }

  getScreenSharingUsersInRoom(roomId) {
    return this.cachedUsers.getScreenSharingUsersInRoom(roomId);
  }

  isAudioFullyConnected() {
    return this.mh.isFullyConnected();
  }

  // chat messages function
  sendChatMessage(data) {
    console.log(data);
    if (typeof data.roomId !== "string") data.roomId = data.roomId.toString();
    if (typeof data.userId !== "string") data.userId = data.userId.toString();
    const room = this.cachedRooms.get(data.roomId);
    if (room) {
      data.roomId = data.roomId + "@" + data.serverId;
      if (this.wsConnection) {
        this.wsConnection.send("sendChatMessage", { ...data, id: data.userId });
      } else {
        console.error("Socket not found");
      }
    }
    else console.error("Room not found in cache");
  }

  setMessagesCache({ messages, roomId }) {
    if (typeof roomId !== "string") roomId = roomId.toString();
    // extract all userId from the messages array and remove duplicates
    const userIds = [];
    messages.forEach((message) => {
      if (typeof message.userId !== "string") message.userId = message.userId.toString();
      userIds.push(message.userId);
    });
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) return this.messagesCacheUpdated([]);
    uniqueUserIds.forEach((userId) => {
      const room = this.cachedRooms.get(roomId);
      if (room) {
        const user = this.cachedUsers.get(userId);
        if (user) {
          room.chat.clear();
          messages.forEach((message) => {
            if (typeof message.userId !== "string") message.userId = message.userId.toString();
            if (message.userId === user.id) {
              message.img = user.img || user.userImage;
              message.name = user.name;
            }
            room.chat.add(message)
          });
          this.messagesCacheUpdated(room.chat.get());
        } else {
          console.error("User not found in cache");
          this.needUserCacheUpdate({ id: userId, call: { function: "setMessagesCache", args: { messages, roomId } } });
          this.messagesCacheUpdated([]);
          return;
        }
      } else {
        console.error("Room not found in cache");
        this.messagesCacheUpdated([]);
      }
    });
  }

  checkMessagesCache(roomId) {
    return new Promise((resolve, reject) => {
      if (typeof roomId !== "string") roomId = roomId.toString();
      const room = this.cachedRooms.get(roomId);
      if (room) {
        if (!room.chat.cached) return reject("Room chat not cached");
        resolve(room.chat.get());
      }
      else reject("Room not found in cache");
    });
  }

  sendFriendAction(data) {
    if (this.wsConnection) {
      this.wsConnection.send("friendAction", data);
    }
  }

  apiUnauthorized() {
    //prompt user to login again
    this.tokenExpired();
  }

  checkRoomClicked(data) {
    if (this.wsConnection.socket) {
      this.emit("roomClicked", data);
    } else {
      // reconnect to socket
      console.error("Socket not found, reconnecting...");
      this.wsConnection.connect(storage.get('token'));
      // retry the action (BAD, but ok for now)
      this.checkRoomClicked(data);
    }
  }
}

Emitter.mixin(EchoProtocol);

EchoProtocol.prototype.tokenExpired = function () {
  this.emit("tokenExpired");
}

EchoProtocol.prototype.roomClicked = function (data) {
  this.emit("roomClicked", data);
}

EchoProtocol.prototype.usersCacheUpdated = function (data) {
  this.emit("usersCacheUpdated", data);
}

EchoProtocol.prototype.rtcConnectionStateChange = function (data) {
  if (data.state === 'failed') {
    alert("Mediasoup connection failed. Websocket is working but your firewall might be blocking it.")
    this.closeConnection();
    this.localUserCrashed({ id: sessionStorage.getItem("id") });
    return;
  }

  this.currentConnectionState = data.state;
  this.emit("rtcConnectionStateChange", data);
}

EchoProtocol.prototype.updatedAudioState = function (data) {
  this.updateUser({ id: data.id, field: "muted", value: data.muted });
  this.updateUser({ id: data.id, field: "deaf", value: data.deaf });
  this.emit("updatedAudioState", data);
}

EchoProtocol.prototype.userJoinedChannel = function (data) {
  this.emit("userJoinedChannel", data);
}

EchoProtocol.prototype.userLeftChannel = function (data) {
  this.emit("userLeftChannel", data);
}

EchoProtocol.prototype.receiveChatMessage = function (data) {
  this.emit("receiveChatMessage", data);
}

EchoProtocol.prototype.messagesCacheUpdated = function (data) {
  this.emit("messagesCacheUpdated", data);
}

EchoProtocol.prototype.needUserCacheUpdate = function (data) {
  this.emit("needUserCacheUpdate", data);
}

EchoProtocol.prototype.audioStatsUpdate = function (data) {
  this.updateUser({ id: data.id, field: "talking", value: data.talking })
  this.emit("audioStatsUpdate", data);
}

EchoProtocol.prototype.videoBroadcastStarted = function (data) {
  this.emit("videoBroadcastStarted", data);
}

EchoProtocol.prototype.videoBroadcastStop = function (data) {
  this.emit("videoBroadcastStop", data);
}

EchoProtocol.prototype.exitedFromRoom = function (data) {
  this.emit("exitedFromRoom", data);
}

EchoProtocol.prototype.joinedRoom = function (data) {
  this.emit("joinedRoom", data);
}

EchoProtocol.prototype.gotVideoStream = function (data) {
  this.emit("gotVideoStream", data);
}

EchoProtocol.prototype.localUserCrashed = function (data) {
  this.emit("localUserCrashed", data);
}

EchoProtocol.prototype.friendCacheUpdated = function (data) {
  this.emit("friendCacheUpdated", data);
}

export default EchoProtocol;