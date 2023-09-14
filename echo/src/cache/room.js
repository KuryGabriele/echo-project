import Chat from "./chat.js";

class Room {
    constructor(data) {
        console.log("created room to cache", data)

        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.maxUsers = data.maxUsers;

        this.chat = new Chat();
    }
}

export default Room;