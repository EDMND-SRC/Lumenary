import * as THREE from 'three';
import { gsap } from 'gsap';
import type { LumenaryScene } from '../config/scenes';

export class MapSceneSelector {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private markers: Map<string, THREE.Mesh> = new Map();
  private markerGlows: Map<string, THREE.Mesh> = new Map();
  private activeMarker: THREE.Mesh | null = null;
  private isAnimating: boolean = false;
  private onSelect: (scene: LumenaryScene) => void;
  private scenes: LumenaryScene[];
  private hoveredMarker: THREE.Mesh | null = null;
  private infoPanel: HTMLDivElement;
  private titleElement: HTMLHeadingElement;
  private descElement: HTMLParagraphElement;
  private enterButton: HTMLButtonElement;

  constructor(
    container: HTMLDivElement,
    scenes: LumenaryScene[],
    onSelect: (scene: LumenaryScene) => void
  ) {
    this.container = container;
    this.scenes = scenes;
    this.onSelect = onSelect;
    this.canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
    this.infoPanel = document.getElementById('scene-info') as HTMLDivElement;
    this.titleElement = document.getElementById('scene-title') as HTMLHeadingElement;
    this.descElement = document.getElementById('scene-desc') as HTMLParagraphElement;
    this.enterButton = document.getElementById('enter-scene-btn') as HTMLButtonElement;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 6);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.setupLights();
    this.createBotswanaMap();
    this.createMarkers();
    this.setupEventListeners();
    this.animate();
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    this.scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x00c2cb, 0.6, 20);
    pointLight.position.set(-3, 2, 4);
    this.scene.add(pointLight);
  }

  private createBotswanaMap(): void {
    const botswanaShape = new THREE.Shape();
    botswanaShape.moveTo(-1.8, -1.2);
    botswanaShape.lineTo(1.6, -1.2);
    botswanaShape.lineTo(1.8, -0.6);
    botswanaShape.lineTo(1.6, 0.2);
    botswanaShape.lineTo(1.2, 0.8);
    botswanaShape.lineTo(0.6, 1.2);
    botswanaShape.lineTo(-0.2, 1.0);
    botswanaShape.lineTo(-1.0, 1.2);
    botswanaShape.lineTo(-1.6, 0.8);
    botswanaShape.lineTo(-1.8, 0.0);
    botswanaShape.lineTo(-1.8, -1.2);

    const extrudeSettings = {
      depth: 0.15,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
    };

    const geometry = new THREE.ExtrudeGeometry(botswanaShape, extrudeSettings);
    const material = new THREE.MeshStandardMaterial({
      color: 0x111118,
      metalness: 0.3,
      roughness: 0.7,
      emissive: 0x0a0a12,
      emissiveIntensity: 0.2,
    });

    const mapMesh = new THREE.Mesh(geometry, material);
    mapMesh.rotation.x = -Math.PI * 2;
    mapMesh.position.z = -0.1;
    this.scene.add(mapMesh);

    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x00c2cb,
      transparent: true,
      opacity: 0.4,
    });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.rotation.x = -Math.PI * 2;
    edges.position.z = -0.1;
    this.scene.add(edges);
  }

  private latLngToPosition(lat: number, lng: number): THREE.Vector3 {
    const latRange = { min: -26.9, max: -17.8 };
    const lngRange = { min: 19.9, max: 29.4 };
    const x = ((lng - lngRange.min) / (lngRange.max - lngRange.min)) * 3.2 - 1.6;
    const y = -((lat - latRange.min) / (latRange.max - latRange.min)) * 2.2 + 1.0;
    return new THREE.Vector3(x, y, 0.2);
  }

  private createMarkers(): void {
    for (const sceneData of this.scenes) {
      const pos = this.latLngToPosition(
        sceneData.coordinates.lat,
        sceneData.coordinates.lng
      );

      const markerGeometry = new THREE.SphereGeometry(0.12, 32, 32);
      const markerMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(sceneData.accentColor),
        emissive: new THREE.Color(sceneData.accentColor),
        emissiveIntensity: 0.5,
        metalness: 0.6,
        roughness: 0.3,
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(pos);
      marker.userData = { sceneId: sceneData.id, sceneData };
      this.scene.add(marker);
      this.markers.set(sceneData.id, marker);

      const glowGeometry = new THREE.SphereGeometry(0.2, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(sceneData.accentColor),
        transparent: true,
        opacity: 0.15,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.copy(pos);
      this.scene.add(glow);
      this.markerGlows.set(sceneData.id, glow);

      gsap.to(glow.scale, {
        x: 1.5,
        y: 1.5,
        z: 1.5,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      gsap.to(glowMaterial, {
        opacity: 0.05,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    this.canvas.addEventListener('click', () => {
      if (this.hoveredMarker && !this.isAnimating) {
        const sceneData = this.hoveredMarker.userData.sceneData as LumenaryScene;
        this.selectScene(sceneData);
      }
    });

    this.enterButton.addEventListener('click', () => {
      if (this.activeMarker && !this.isAnimating) {
        const sceneData = this.activeMarker.userData.sceneData as LumenaryScene;
        this.onSelect(sceneData);
      }
    });

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  private onResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private selectScene(sceneData: LumenaryScene): void {
    const marker = this.markers.get(sceneData.id);
    if (!marker) return;

    this.isAnimating = true;
    this.activeMarker = marker;

    gsap.to(marker.scale, {
      x: 1.5,
      y: 1.5,
      z: 1.5,
      duration: 0.3,
      ease: 'back.out(1.7)',
    });

    this.titleElement.textContent = sceneData.name;
    this.descElement.textContent = sceneData.description;
    this.enterButton.textContent = `Enter ${sceneData.name}`;

    gsap.to(this.infoPanel, {
      opacity: 1,
      y: 0,
      duration: 0.4,
      ease: 'power2.out',
    });

    this.isAnimating = false;
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const markerArray = Array.from(this.markers.values());
    const intersects = this.raycaster.intersectObjects(markerArray);

    if (intersects.length > 0) {
      const hit = intersects[0].object as THREE.Mesh;
      if (this.hoveredMarker !== hit) {
        if (this.hoveredMarker) {
          gsap.to(this.hoveredMarker.scale, { x: 1, y: 1, z: 1, duration: 0.2 });
          (this.hoveredMarker.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
        }
        this.hoveredMarker = hit;
        gsap.to(hit.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 0.2 });
        (hit.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0;
        this.canvas.style.cursor = 'pointer';
      }
    } else {
      if (this.hoveredMarker) {
        gsap.to(this.hoveredMarker.scale, { x: 1, y: 1, z: 1, duration: 0.2 });
        (this.hoveredMarker.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
        this.hoveredMarker = null;
        this.canvas.style.cursor = 'default';
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.container.classList.add('visible');
    gsap.fromTo(this.container, { opacity: 0 }, { opacity: 1, duration: 0.6 });
  }

  hide(): void {
    gsap.to(this.container, {
      opacity: 0,
      duration: 0.4,
      onComplete: () => {
        this.container.classList.remove('visible');
        this.container.classList.add('hidden');
      },
    });
  }

  destroy(): void {
    this.renderer.dispose();
    this.scene.clear();
  }
}
