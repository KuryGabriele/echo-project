import React from 'react'
import Rooms from './Rooms'
import RoomControl from './RoomControl'
import { Divider } from '@mui/material'

function Sidebar({ users }) {

  return (
    <div className='sidebar'>
      <RoomControl />
      <Divider style={{ background: '#f5e8da' }} variant="middle" />
      <Rooms users={users}/>
    </div>
  )
}

export default Sidebar