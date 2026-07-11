import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { useMapEvents, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet.fullscreen';
import screenfull from 'screenfull';
import './Control.FullScreen.css';

const getEventsFromProps = ({ enterFullscreen, exitFullscreen }) => {
  const events = {};

  if (enterFullscreen) {
    events.enterFullscreen = enterFullscreen;
  }

  if (exitFullscreen) {
    events.exitFullscreen = exitFullscreen;
  }

  return events;
};

const Fullscreen = ({ eventHandlers = {}, ...props }) => {
  const map = useMap();
  useMapEvents({ ...getEventsFromProps(eventHandlers) });

  useEffect(() => {
    window.screenfull = screenfull;
  });

  const affectedMap = useRef();
  useLayoutEffect(() => {
    if (map !== affectedMap.current)
      L.control.fullscreen(props).addTo(map);
    affectedMap.current = map;
  }, [map]);

  return null;
};

export default Fullscreen;