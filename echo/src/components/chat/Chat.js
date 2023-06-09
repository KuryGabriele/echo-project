import { useEffect, useState } from 'react'
import MessageRight from './MessageRight'
import MessageLeft from './MessageLeft'

import LoadingAnimation from '../mainpage/LoadingAnimation'

const api = require('../../api');

function Chat({ currentRoomId }) {
  const [loadingVisibility, setLoadingVisibility] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    setLoadingVisibility(true);

    // get messages from api
    api.call("rooms/" + currentRoomId + "/messages")
      .then((res) => {
        console.log("messages got from api: ", res.json);
        setLoadingVisibility(false);
        setMessages(res.json);
      })
      .catch((err) => {
        console.error(err);
        setLoadingVisibility(false);
        setMessages([]);
      });
  }, [currentRoomId])
  
  return (
    <div className='chat'>
      <LoadingAnimation visibility={loadingVisibility} style={{
          // style the element in middle of chat div
          position: 'absolute',
          top: '50%',
          left: '55%',
          transform: 'translate(-50%, -50%)'
        }}
      />

      {messages.length > 0 ? messages.map((message) => {
        if (String(message.userId) === String(localStorage.getItem("id"))) {
          return <MessageLeft key={message.id} message={message} />
        } else {
          return <MessageRight key={message.id} message={message} />
        }
      }) : <div className='noMessages'>No messages yet</div>}
      
    </div>
  )
}

export default Chat