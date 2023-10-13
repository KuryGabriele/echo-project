import '../../css/onlineusers.css'

import { Avatar, Divider, Menu, MenuItem, Stack, Slider, Grid } from '@mui/material'
import { VolumeUp, Circle, DarkMode, DoNotDisturbOn, MicOffRounded, VolumeOff } from '@mui/icons-material';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import { useState, useEffect } from 'react'

import { ep } from "../../index";
import OnlineUsersMenuItems from './OnlineUsersMenuItems';

function OnlineUserIcon({ user }) {
  user.id = user.id.toString();

  const [anchorEl, setAnchorEl] = useState(null);
  const [userVolume, setUserVolulme] = useState(100);
  const [deaf, setDeaf] = useState(false);
  const [muted, setMuted] = useState(false);
  const [talking, setTalking] = useState(false);
  const [broadcastingVideo, setBroadcastingVideo] = useState(user.broadcastingVideo);

  const open = Boolean(anchorEl);

  useEffect(() => {
    ep.on("updatedAudioState", "OnlineUserIcon.updatedAudioState", (data) => {
      if (data.id === user.id) {
        setDeaf(data.deaf);
        setMuted(data.muted);
      }
    });

    ep.on("audioStatsUpdate", "OnlineUserIcon.audioStatsUpdate", (audioData) => {
      if (audioData.id === user.id) {
        setTalking(audioData.talking);
      }
    });

    ep.on("videoBroadcastStarted", "OnlineUserIcon.videoBroadcastStarted", (data) => {
      if (data.id === user.id) {
        setBroadcastingVideo(true)
      }
    });

    ep.on("videoBroadcastStop", "OnlineUserIcon.videoBroadcastStop", (data) => {
      if (data.id === user.id) {
        setBroadcastingVideo(false)
      }
    });

    // used on re-render of component to set user's first mic and deaf state
    // DO NOT TOUCH THIS (i did this thrice already and fucked up shit)
    setDeaf(user.deaf);
    setMuted(user.muted);

    return () => {
      ep.releaseGroup('OnlineUserIcon.updatedAudioState');
      ep.releaseGroup('OnlineUserIcon.audioStatsUpdate');
    };
  }, [user]);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const handleVolumeChange = (event, newValue) => {
    //set user volume
    setUserVolulme(newValue);
    ep.setUserVolume(newValue / 100, user.id)
  };

  return (
    <div className="onlineUserContainer">
      <div
        className="onlineUserIcon noselect pointer"
        onContextMenu={handleClick}
        onClick={handleClick}
        size="small"
        aria-controls={open ? 'account-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
      >
        <Avatar className={talking ? "talking" : ""} alt={user.name} src={user.userImage} sx={{ height: '1.8rem', width: '1.8rem' }} />
        <p className='onlineUserNick'>{user.name}</p>
        <Grid container direction="row" justifyContent="right" sx={{ color: "white" }}>
          {deaf ? <VolumeOff fontSize="small" /> : null}
          {muted ? <MicOffRounded fontSize="small" /> : null}
          {broadcastingVideo ? <ScreenShareIcon fontSize="small" style={{ color: "red" }} /> : null}
        </Grid>
      </div>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transitionDuration={100}
        MenuListProps={{ 'aria-labelledby': 'userIcon', 'className': 'userMenuModal' }}
      >
        <div style={{ width: "100%", textAlign: "-webkit-center", marginBottom: ".3rem" }}>
          <div className="avatarBadge">
            <Avatar alt={user.name} src={user.userImage} sx={{ height: '4rem', width: '4rem' }} style={{ border: "3px solid white" }} />
            {user.online === "1" ? <Circle className="statusIndicator" style={{ color: "#44b700" }} /> : null}
            {user.online === "2" ? <DarkMode className="statusIndicator rotateMoon" style={{ color: "#ff8800" }} /> : null}
            {user.online === "3" ? <DoNotDisturbOn className="statusIndicator" style={{ color: "#fd4949" }} /> : null}
            {user.online === "4" ? <Circle className="statusIndicator" style={{ color: "#f5e8da" }} /> : null}
          </div>
          <p style={{ marginTop: ".8rem" }}>{user.name}</p>
        </div>

        <MenuItem>
          <div style={{ width: "100%" }}>
            <Stack spacing={2} direction="row" alignItems="center">
              <VolumeUp fontSize="10px" />
              <Slider
                sx={{ width: 110 }}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => { return v + "%" }}
                aria-label="Volume"
                value={userVolume}
                onChange={handleVolumeChange}
                size='medium'
              />
            </Stack>
          </div>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} variant='middle' />
        <OnlineUsersMenuItems user={user} broadcastingVideo={broadcastingVideo} handleClose={handleClose} />
      </Menu>
    </div>
  )
}

OnlineUserIcon.defaultProps = {
  name: "None",
  talking: false,
}

export default OnlineUserIcon