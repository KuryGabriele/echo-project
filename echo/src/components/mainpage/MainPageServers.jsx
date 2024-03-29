import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { TransitionGroup } from 'react-transition-group';

import { Divider, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';

import { ep, storage } from "../../index";
import MainPageServersComponent from './MainPageServersComponent';

import StylingComponents from '../../StylingComponents';

const api = require('../../lib/api');

function MainPageServers({ }) {
  const [servers, setServers] = useState([]);
  const navigate = useNavigate();

  const updateServers = () => {
    api.call('servers/')
      .then((res) => {
        setServers(res.json);
      })
      .catch((err) => {
        console.error(err.message);
      });
  }

  useEffect(() => {
    updateServers();
  }, []);

  const enterServer = async (serverId) => {
    // TODO: check the initial status of user (maybe get it from the login form?)
    // and check if we need to update it or not
    api.call('users/status', "POST", { id: sessionStorage.getItem('id'), status: "1" })
      .then((res) => {
        ep.openConnection(sessionStorage.getItem('id'));
        navigate("/main");

        ep.addUser({
          id: sessionStorage.getItem('id'),
          name: sessionStorage.getItem('name'),
          userImage: sessionStorage.getItem('userImage'),
          status: storage.get('status'),
          online: storage.get('online'),
          roomId: 0
        }, true);
      })
      .catch((err) => {
        console.error(err.message);
      });
  }

  return (
    <StylingComponents.MainPageServer.MainServersListContainer>
      <StylingComponents.MainPageServer.StyledMainPageServersComponent>
        <StylingComponents.MainPageServer.StyledMainPageServersComponentIcon>
          <Add style={{ color: "#f5e8da" }} fontSize="large" />
          <Typography style={{ color: "#f5e8da", fontSize: "1.6rem" }}>CREATE SERVER</Typography>
        </StylingComponents.MainPageServer.StyledMainPageServersComponentIcon>
      </StylingComponents.MainPageServer.StyledMainPageServersComponent>
      <Divider style={{ background: '#f5e8da' }} variant="middle" />
      <StylingComponents.MainPageServer.StyledMainPageServersComponentServersList>
        <TransitionGroup>
          {servers.map((server, id) => {
            return (
              MainPageServersComponent({ server, id, enterServer })
            )
          })}
        </TransitionGroup>
      </StylingComponents.MainPageServer.StyledMainPageServersComponentServersList>
    </StylingComponents.MainPageServer.MainServersListContainer>
  )
}

export default MainPageServers;