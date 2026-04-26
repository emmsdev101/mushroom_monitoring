IoT Implementation Plan: Oyster Mushroom Monitoring System

1. Technical Architecture

The system uses a Device-to-Cloud-to-App architecture.

Hardware: ESP32 + DHT22 + Sensirion SCD41 (I2C CO2) + Relay.

Backend (Firebase): * Realtime Database: Stores live sensor values for instant UI updates.

Firestore: Stores historical logs for growth analysis.

Cloud Messaging (FCM): Sends push notifications when levels are critical.

Client App: React Native (Android) for monitoring and manual override.

2. Real-Time Data Flow

ESP32 connects to local Wi-Fi.

ESP32 pushes JSON data {temp, hum, co2, fanStatus} to the API (mirrored to Firebase by the server) every 5 seconds.

React Native App listens to the Firebase reference using onValue (Realtime DB).

If $CO_2 > 800ppm$ (configurable), the ESP32 triggers the relay and Firebase Cloud Functions triggers a push notification to the Android app.

3. App Feature Roadmap

Phase 1: Dashboard (The "Monitoring" Objective)

Live Gauges: Visual representation of Temperature ($^\circ C$), Humidity ($\%$), and $CO_2$ ($ppm$).

Status Indicators: Color-coded cards (Green: Optimal, Red: Warning).

Connection Heartbeat: Shows if the ESP32 is currently online.

Phase 2: Historical Analysis

Line Charts: Using react-native-gifted-charts to view trends over the last 24 hours.

Export Data: Ability to export logs as CSV for agricultural research.

Phase 3: Notifications & Control (The "Response" Objective)

Alert Settings: User-defined thresholds for "Danger Zones."

Manual Override: A toggle switch to manually activate the Exhaust Fan regardless of sensor readings.

4. UI/UX Design Strategy

Home Screen: Minimalist cards with large font for quick reading in a farm environment.

Theme: Dark mode support (to reduce eye strain in dimly lit mushroom houses) with "Forest Green" accents.

Navigation: Bottom tabs (Dashboard, History, Settings).

5. Security & Deployment

Auth: Simple Firebase Anonymous Auth or Email/Password for the grower.

Rules: Firestore security rules to ensure only the owner can toggle the exhaust fan.

APK Generation: Using Expo EAS or standard Gradle build for Android distribution.