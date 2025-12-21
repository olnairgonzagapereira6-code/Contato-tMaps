import { useCallback, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";

import "./App.css";

import type { ChangeEvent } from "react";
import type {
  MapCameraChangedEvent,
  MapCameraProps,
} from "@vis.gl/react-google-maps";

const MAPS_API_KEY = import.meta.env.VITE_MAPS_API_KEY as string;

// START: Sample Data
const SANTIAGO_LOCATION = { lat: -33.45722938110794, lng: -70.66642630502507 };
const LAGOS_LOCATION = { lat: 6.537278579005752, lng: 3.3148704496574943 };
const PORTO_ALEGRE_LOCATION = { lat: -30.0346, lng: -51.2177 };

const contacts = [
  { name: "Ana", location: { lat: -30.0346, lng: -51.2177 } }, // Porto Alegre
  { name: "Beatriz", location: { lat: -33.4572, lng: -70.6664 } }, // Santiago
  { name: "Carlos", location: { lat: 6.5372, lng: 3.3148 } }, // Lagos
];
// END: Sample Data

const SANTIAGO_CAMERA_STATE = {
  center: SANTIAGO_LOCATION,
  zoom: 10,
  heading: 0,
  tilt: 0,
};

const LAGOS_CAMERA_STATE = {
  center: LAGOS_LOCATION,
  zoom: 10,
  heading: 0,
  tilt: 0,
};

const PORTO_ALEGRE_CAMERA_STATE = {
  center: PORTO_ALEGRE_LOCATION,
  zoom: 10,
  heading: 0,
  tilt: 0,
};

function App() {
  const [cameraState, setCameraState] = useState<MapCameraProps>(
    SANTIAGO_CAMERA_STATE,
  );
  const [city, setCity] = useState("santiago");
  const [searchTerm, setSearchTerm] = useState("");
  const [foundContact, setFoundContact] = useState<any>(null);

  const onCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    setCameraState(ev.detail);
  }, []);

  const onCityChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const newCity = e.target.value;
    setCity(newCity);
    if (newCity === "santiago") {
      setCameraState(SANTIAGO_CAMERA_STATE);
    } else if (newCity === "lagos") {
      setCameraState(LAGOS_CAMERA_STATE);
    } else {
      setCameraState(PORTO_ALEGRE_CAMERA_STATE);
    }
    setFoundContact(null); // Clear contact when city changes
  }, []);

  const handleSearch = () => {
    const contact = contacts.find(
      (c) => c.name.toLowerCase() === searchTerm.toLowerCase(),
    );
    if (contact) {
      setFoundContact(contact);
      setCameraState({ center: contact.location, zoom: 12, heading: 0, tilt: 45 });
    } else {
      alert("Contato não encontrado!");
      setFoundContact(null);
    }
  };

  return (
    <>
      <h1>Vite + React + Google Maps Platform</h1>
      
      <div id="search-container">
        <input
          type="text"
          placeholder="Encontrar contato..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={handleSearch}>Buscar</button>
      </div>

      <div id="city-chooser">
        <p>
          <strong>Ou escolha uma cidade para ver no mapa</strong>
        </p>
        <div id="radios">
          <label>
            <input
              type="radio"
              id="santiago"
              name="city"
              value="santiago"
              checked={city === "santiago"}
              onChange={onCityChange}
            />{" "}
            Santiago
          </label>
          <label>
            <input
              type="radio"
              id="lagos"
              name="city"
              value="lagos"
              checked={city === "lagos"}
              onChange={onCityChange}
            />{" "}
            Lagos
          </label>
          <label>
            <input
              type="radio"
              id="porto_alegre"
              name="city"
              value="porto_alegre"
              checked={city === "porto_alegre"}
              onChange={onCityChange}
            />{" "}
            Porto Alegre
          </label>
        </div>
      </div>

      <div id="map">
        <APIProvider
          apiKey={MAPS_API_KEY}
          solutionChannel="GMP_idx_templates_v0_reactts"
        >
          <Map
            mapId={"DEMO_MAP_ID"}
            disableDefaultUI={true}
            {...cameraState}
            onCameraChanged={onCameraChanged}
          >
            {/* Show markers for cities OR the found contact */}
            {!foundContact && <Marker position={SANTIAGO_LOCATION} />}
            {!foundContact && <Marker position={LAGOS_LOCATION} />}
            {!foundContact && <Marker position={PORTO_ALEGRE_LOCATION} />}
            {foundContact && <Marker position={foundContact.location} />}
          </Map>
        </APIProvider>
      </div>
    </>
  );
}

export default App;