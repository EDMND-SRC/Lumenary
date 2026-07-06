export interface LumenaryScene {
  id: string;
  name: string;
  description: string;
  coordinates: { lat: number; lng: number };
  plyUrl: string;
  thumbnailColor: string;
  accentColor: string;
  defaultCamera: {
    position: [number, number, number];
    target: [number, number, number];
  };
  trainingStats?: {
    iterations: number;
    splatCount: number;
    trainingTime: string;
  };
}

export const LUMENARY_SCENES: LumenaryScene[] = [
  {
    id: 'okavango_delta',
    name: 'Okavango Delta',
    description: 'UNESCO World Heritage Site — the world\'s largest inland delta, a pristine wetland deep in the Kalahari Desert.',
    coordinates: { lat: -19.5, lng: 22.5 },
    plyUrl: 'https://storage.googleapis.com/lumenary-viewer-us/okavango_delta/density_map.ply',
    thumbnailColor: '#0e7490',
    accentColor: '#00c2cb',
    defaultCamera: {
      position: [0, 2, 5],
      target: [0, 0, 0],
    },
  },
  {
    id: 'gaborone_city',
    name: 'Gaborone',
    description: 'The capital city of Botswana — a modern African metropolis rising from the Kalahari.',
    coordinates: { lat: -24.6282, lng: 25.9231 },
    plyUrl: 'https://storage.googleapis.com/lumenary-viewer-us/gaborone_city/density_map.ply',
    thumbnailColor: '#b45309',
    accentColor: '#e8a838',
    defaultCamera: {
      position: [0, 2, 5],
      target: [0, 0, 0],
    },
  },
];

export const getSceneById = (id: string): LumenaryScene | undefined =>
  LUMENARY_SCENES.find((s) => s.id === id);
