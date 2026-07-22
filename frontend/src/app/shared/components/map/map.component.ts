import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { DroneRecord } from '../../../core/models';
import { isLowBattery, markerColor } from '../../status-colors';

const DEFAULT_CENTER: L.LatLngTuple = [32.08, 34.9];
const DEFAULT_ZOOM = 9;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css',
})
export class MapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() points: DroneRecord[] = [];
  @Input() pathPoints: DroneRecord[] = [];
  @Output() droneSelected = new EventEmitter<string>();

  @ViewChild('mapContainer', { static: true }) private mapContainerRef!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private markersLayer?: L.LayerGroup;
  private pathLayer?: L.Polyline;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapContainerRef.nativeElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.redrawMarkers();
    this.redrawPath();

    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(this.mapContainerRef.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['points']) this.redrawMarkers();
    if (changes['pathPoints']) this.redrawPath();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private redrawMarkers(): void {
    if (!this.markersLayer) return;
    this.markersLayer.clearLayers();

    for (const point of this.points) {
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: isLowBattery(point) ? 9 : 7,
        color: markerColor(point),
        fillColor: markerColor(point),
        fillOpacity: 0.85,
        weight: point.status === 'lost_signal' ? 3 : 2,
        dashArray: point.status === 'lost_signal' ? '4' : undefined,
      });

      marker.bindPopup(this.popupHtml(point));
      marker.on('click', () => this.droneSelected.emit(point.drone_id));
      marker.addTo(this.markersLayer);
    }
  }

  private redrawPath(): void {
    if (!this.map) return;
    if (this.pathLayer) {
      this.map.removeLayer(this.pathLayer);
      this.pathLayer = undefined;
    }
    if (this.pathPoints.length < 2) return;

    const latLngs: L.LatLngTuple[] = this.pathPoints.map((p) => [p.latitude, p.longitude]);
    this.pathLayer = L.polyline(latLngs, { color: '#4fd1c5', weight: 3, opacity: 0.7 }).addTo(this.map);
  }

  private popupHtml(point: DroneRecord): string {
    const lastUpdate = new Date(point.timestamp).toLocaleString();
    return `
      <div class="drone-popup">
        <strong>${point.drone_id}</strong> (${point.drone_type})<br>
        Operator: ${point.operator_id}<br>
        Altitude: ${point.altitude_m} m<br>
        Speed: ${point.speed_kmh} km/h<br>
        Battery: ${point.battery_percent}%<br>
        Status: ${point.status}<br>
        Last update: ${lastUpdate}
      </div>
    `;
  }
}
