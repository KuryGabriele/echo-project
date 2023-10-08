import { storage } from '../index';

class Users {
    constructor() {
        this.users = {};
    }

    typeCheck(data) {
        if (typeof data !== "object") {
            if (typeof data === "boolean") return data;
            return data = String(data);
        }
        if (data.img) data.userImage = data.img;
        if (data.roomId) data.currentRoom = data.roomId;
        if (data.id && typeof data.id !== "string") data.id = String(data.id);
        if (data.name && typeof data.name !== "string") data.name = String(data.name);
        if (data.online && typeof data.online !== "string") data.online = String(data.online);
        if (data.currentRoom && typeof data.currentRoom !== "string") data.currentRoom = String(data.currentRoom);
        if (!data.userId && data.id) data.userId = data.id;
        if (data.muted && typeof data.muted !== "boolean") {
            if (data.muted === "true") data.muted = true;
            else if (data.muted === "false") data.muted = false;
        }
        if (data.deaf && typeof data.deaf !== "boolean") {
            if (data.deaf === "true") data.deaf = true;
            else if (data.deaf === "false") data.deaf = false;
        }
        if(data.broadcastingVideo && typeof data.broadcastingVideo !== "boolean") {
            if (data.broadcastingVideo === "true") data.broadcastingVideo = true;
            else if (data.broadcastingVideo === "false") data.broadcastingVideo = false;
        }
        return data;
    }

    add(data, self = false) {
        if (!data) return console.error("[CACHE] Data is required to add a user to the cache");
        // data type check
        data = this.typeCheck(data);
        console.log("[CACHE] Added user in cache", data)

        if (self) {
            storage.set("id", data.id);
            storage.set("name", data.name);
            storage.set("userImage", data.userImage);
            storage.set("online", data.online);
        }

        if (!data.id) return console.error("[CACHE] ID is required to add a user to the cache");
        if (!data.name) return console.error("[CACHE] Name is required to add a user to the cache");
        if (!data.online) return console.error("[CACHE] Online is required to add a user to the cache");

        if (this.users[data.id]) return console.warn(`[CACHE] User ${data.id} already exists in cache`);
        
        this.users[data.id] = {
            id: data.id,
            name: data.name,
            userImage: data.userImage || "",
            online: data.online,
            currentRoom: data.currentRoom || "0",
            muted: data.muted || false,
            deaf: data.deaf || false,
            broadcastingVideo: data.broadcastingVideo || false,
            self
        };

        return this.users[data.id];
    }

    getAll() {
        return this.users;
    }

    get(id) {
        // data type check
        id = this.typeCheck(id);
        // if (!this.users[id]) {
        //     this.add((async () => {
        //         const data = await api.call("users/" + id, "GET");
        //         if (data.error) return console.error(data.error);
        //         console.warn(`[CACHE] Added user ${id} in cache from get function`);
        //         return data.json;
        //     })())
        // }
        return this.users[id];
    }

    getInRoom(roomId) {
        // data type check
        roomId = this.typeCheck(roomId);
        const users = [];
        for (const user in this.users) {
            if (this.users[user].currentRoom === roomId) {
                users.push(this.typeCheck(this.users[user]));
            }
        }
        return users;
    }

    update(id, field, value) {
        // data type check
        id = this.typeCheck(id);
        field = this.typeCheck(field);
        value = this.typeCheck(value);
        if (!this.users[id]) return console.error(`[CACHE] User ${id} not found in cache`);
        this.users[id][field] = value;
        console.log(typeof id, typeof field, typeof value)
        console.log("[CACHE] Updated user in cache", id, field, value)
    }
}

export default Users;