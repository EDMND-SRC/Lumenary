import type { RoomDefinition, TransitionPath } from '../core/types';

// Maruapula House — Room Definitions (prop_maruapula_house_01)
// All coordinates are estimated for the property layout.
// Quaternion rotation [x, y, z, w] where [0,0,0,1] = identity (no rotation).

export const MARUAPULA_ROOMS: RoomDefinition[] = [
  {
    id: 'living_room',
    name: 'Living Room',
    bounds: {
      center: [0, 1.5, 0],
      halfExtents: [4, 1.5, 5],
      rotation: [0, 0, 0, 1],
    },
    center: [0, 1.2, 0],
    hotspots: [
      {
        id: 'lr_entry',
        position: [0, 1.2, -4.5],
        label: 'Main Entry',
        type: 'viewpoint',
      },
      {
        id: 'lr_window',
        position: [3.8, 1.5, 0],
        label: 'Window View',
        type: 'info',
      },
      {
        id: 'lr_to_kitchen',
        position: [-3.8, 1.2, 0],
        label: 'To Kitchen',
        type: 'transition',
        targetRoomId: 'kitchen',
      },
      {
        id: 'lr_to_hall',
        position: [0, 1.2, 4.8],
        label: 'To Hallway',
        type: 'transition',
        targetRoomId: 'hallway',
      },
    ],
    audioSources: [
      {
        id: 'lr_ambient',
        url: '/audio/living_room_ambient.mp3',
        position: [0, 1.5, 0],
        maxDistance: 15,
        referenceDistance: 3,
        loop: true,
        gain: 0.3,
      },
    ],
    adjacentRoomIds: ['kitchen', 'hallway'],
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    bounds: {
      center: [-7, 1.5, 0],
      halfExtents: [3, 1.5, 4],
      rotation: [0, 0, 0, 1],
    },
    center: [-7, 1.2, 0],
    hotspots: [
      {
        id: 'kt_counter',
        position: [-7, 1.0, -3.5],
        label: 'Kitchen Counter',
        type: 'info',
      },
      {
        id: 'kt_to_living',
        position: [-3.8, 1.2, 0],
        label: 'To Living Room',
        type: 'transition',
        targetRoomId: 'living_room',
      },
    ],
    audioSources: [
      {
        id: 'kt_ambient',
        url: '/audio/kitchen_ambient.mp3',
        position: [-7, 1.5, 0],
        maxDistance: 12,
        referenceDistance: 2,
        loop: true,
        gain: 0.25,
      },
    ],
    adjacentRoomIds: ['living_room'],
  },
  {
    id: 'master_bedroom',
    name: 'Master Bedroom',
    bounds: {
      center: [5, 1.5, 5],
      halfExtents: [3.5, 1.5, 4.5],
      rotation: [0, 0, 0, 1],
    },
    center: [5, 1.2, 5],
    hotspots: [
      {
        id: 'mb_bed',
        position: [5, 1.0, 7],
        label: 'Master Bed',
        type: 'viewpoint',
      },
      {
        id: 'mb_ensuite',
        position: [8, 1.2, 5],
        label: 'En Suite Bathroom',
        type: 'info',
      },
      {
        id: 'mb_to_hall',
        position: [5, 1.2, 1],
        label: 'To Hallway',
        type: 'transition',
        targetRoomId: 'hallway',
      },
    ],
    audioSources: [
      {
        id: 'mb_ambient',
        url: '/audio/bedroom_ambient.mp3',
        position: [5, 1.5, 5],
        maxDistance: 12,
        referenceDistance: 3,
        loop: true,
        gain: 0.2,
      },
    ],
    adjacentRoomIds: ['hallway'],
  },
  {
    id: 'bedroom_2',
    name: 'Second Bedroom',
    bounds: {
      center: [-5, 1.5, 5],
      halfExtents: [3, 1.5, 3.5],
      rotation: [0, 0, 0, 1],
    },
    center: [-5, 1.2, 5],
    hotspots: [
      {
        id: 'b2_window',
        position: [-5, 1.5, 8.2],
        label: 'Bedroom Window',
        type: 'info',
      },
      {
        id: 'b2_to_hall',
        position: [-5, 1.2, 1.8],
        label: 'To Hallway',
        type: 'transition',
        targetRoomId: 'hallway',
      },
    ],
    audioSources: [
      {
        id: 'b2_ambient',
        url: '/audio/bedroom_ambient.mp3',
        position: [-5, 1.5, 5],
        maxDistance: 10,
        referenceDistance: 3,
        loop: true,
        gain: 0.2,
      },
    ],
    adjacentRoomIds: ['hallway'],
  },
  {
    id: 'hallway',
    name: 'Hallway',
    bounds: {
      center: [0, 1.5, 3],
      halfExtents: [1.5, 1.5, 6],
      rotation: [0, 0, 0, 1],
    },
    center: [0, 1.2, 3],
    hotspots: [
      {
        id: 'hw_to_living',
        position: [0, 1.2, -2.8],
        label: 'To Living Room',
        type: 'transition',
        targetRoomId: 'living_room',
      },
      {
        id: 'hw_to_master',
        position: [1.3, 1.2, 5],
        label: 'To Master Bedroom',
        type: 'transition',
        targetRoomId: 'master_bedroom',
      },
      {
        id: 'hw_to_b2',
        position: [-1.3, 1.2, 5],
        label: 'To Second Bedroom',
        type: 'transition',
        targetRoomId: 'bedroom_2',
      },
      {
        id: 'hw_to_pool',
        position: [0, 0.8, 8.8],
        label: 'To Pool Area',
        type: 'transition',
        targetRoomId: 'pool_area',
      },
    ],
    audioSources: [],
    adjacentRoomIds: ['living_room', 'master_bedroom', 'bedroom_2', 'pool_area'],
  },
  {
    id: 'pool_area',
    name: 'Pool Area',
    bounds: {
      center: [0, -0.5, -8],
      halfExtents: [6, 1, 4],
      rotation: [0, 0, 0, 1],
    },
    center: [0, 0.5, -8],
    hotspots: [
      {
        id: 'pool_edge',
        position: [0, 0.3, -11.5],
        label: 'Pool Edge',
        type: 'viewpoint',
      },
      {
        id: 'pool_garden',
        position: [5.5, 0.8, -8],
        label: 'Garden View',
        type: 'info',
      },
      {
        id: 'pool_to_hall',
        position: [0, 1.2, -4.5],
        label: 'To Hallway',
        type: 'transition',
        targetRoomId: 'hallway',
      },
    ],
    audioSources: [
      {
        id: 'pool_water',
        url: '/audio/pool_water.mp3',
        position: [0, 0, -8],
        maxDistance: 20,
        referenceDistance: 4,
        loop: true,
        gain: 0.4,
      },
      {
        id: 'pool_birds',
        url: '/audio/garden_birds.mp3',
        position: [5, 2, -8],
        maxDistance: 25,
        referenceDistance: 5,
        loop: true,
        gain: 0.15,
      },
    ],
    adjacentRoomIds: ['hallway'],
  },
];

export const MARUAPULA_TRANSITIONS: TransitionPath[] = [
  {
    fromRoomId: 'living_room',
    toRoomId: 'kitchen',
    controlPoints: [
      [-3.8, 1.2, 0],
      [-5.0, 1.2, 0],
      [-7.0, 1.2, 0],
    ],
    duration: 1.5,
  },
  {
    fromRoomId: 'kitchen',
    toRoomId: 'living_room',
    controlPoints: [
      [-3.8, 1.2, 0],
      [-2.0, 1.2, 0],
      [0, 1.2, 0],
    ],
    duration: 1.5,
  },
  {
    fromRoomId: 'living_room',
    toRoomId: 'hallway',
    controlPoints: [
      [0, 1.2, 4.8],
      [0, 1.2, 3.5],
      [0, 1.2, 3.0],
    ],
    duration: 1.2,
  },
  {
    fromRoomId: 'hallway',
    toRoomId: 'living_room',
    controlPoints: [
      [0, 1.2, -2.8],
      [0, 1.2, -1.0],
      [0, 1.2, 0],
    ],
    duration: 1.2,
  },
  {
    fromRoomId: 'hallway',
    toRoomId: 'master_bedroom',
    controlPoints: [
      [1.3, 1.2, 5],
      [3.0, 1.2, 5],
      [5.0, 1.2, 5],
    ],
    duration: 1.5,
  },
  {
    fromRoomId: 'master_bedroom',
    toRoomId: 'hallway',
    controlPoints: [
      [5, 1.2, 1],
      [3.0, 1.2, 2],
      [1.3, 1.2, 3],
    ],
    duration: 1.5,
  },
  {
    fromRoomId: 'hallway',
    toRoomId: 'bedroom_2',
    controlPoints: [
      [-1.3, 1.2, 5],
      [-3.0, 1.2, 5],
      [-5.0, 1.2, 5],
    ],
    duration: 1.5,
  },
  {
    fromRoomId: 'bedroom_2',
    toRoomId: 'hallway',
    controlPoints: [
      [-5, 1.2, 1.8],
      [-3.0, 1.2, 2.5],
      [-1.3, 1.2, 3],
    ],
    duration: 1.5,
  },
  {
    fromRoomId: 'hallway',
    toRoomId: 'pool_area',
    controlPoints: [
      [0, 0.8, 8.8],
      [0, 0.5, -6.0],
      [0, 0.5, -8.0],
    ],
    duration: 2.0,
  },
  {
    fromRoomId: 'pool_area',
    toRoomId: 'hallway',
    controlPoints: [
      [0, 1.2, -4.5],
      [0, 1.2, 0],
      [0, 1.2, 3.0],
    ],
    duration: 2.0,
  },
];

export const PROPERTY_INITIAL_CAMERA = {
  position: [5.0, 3.0, 5.0] as [number, number, number],
  target: [0.0, 0.0, 0.0] as [number, number, number],
};
