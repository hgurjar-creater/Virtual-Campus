# Virtual-Campus
Virtual Campus is a real-time multiplayer virtual campus platform where users can explore interactive 2D spaces, communicate with others, and collaborate in shared rooms. Built with Phaser.js, Node.js, and WebSockets for seamless real-time synchronization.


## Overview

Virtual Campus is a real-time multiplayer web application designed to provide users with an interactive virtual campus environment. The platform allows users to navigate a shared 2D space, interact with other participants, and communicate in real time.

The application is designed as a self-hosted solution and uses WebSocket technology to synchronize player activities and interactions across connected clients.

## Features

* Interactive 2D virtual campus environment
* Real-time multiplayer functionality
* Live player synchronization
* Real-time communication
* Interactive rooms and shared spaces
* WebSocket-based client-server communication
* Self-hosted server architecture

## Technology Stack

The project is built using the following technologies:

| Technology | Purpose                                     |
| ---------- | ------------------------------------------- |
| HTML       | Application structure                       |
| CSS        | User interface and styling                  |
| JavaScript | Client-side application logic               |
| Phaser.js  | 2D game and interactive environment         |
| Node.js    | Backend server                              |
| WebSockets | Real-time communication and synchronization |

## Project Architecture

The application follows a client-server architecture.

The client is responsible for rendering the virtual environment, processing user interactions, and sending player actions to the server. The server manages active connections and synchronizes relevant information between connected users using WebSockets.

```text id="ptl9q7"
Client
   │
   │ Player Actions
   ▼
WebSocket Server
   │
   │ Synchronization
   ▼
Connected Clients
```

## Installation

### Prerequisites

Before running the project, ensure that the following software is installed:

* Node.js
* npm

### Clone the Repository

```bash id="f8v4n2"
git clone <repository-url>
cd virtual-campus
```

### Install Dependencies

```bash id="r6k2wx"
npm install
```

### Start the Application

```bash id="m3j9vl"
npm start
```

## Usage

After starting the server, open the application in a supported web browser.

The application allows users to enter the virtual campus environment and interact with other connected users in real time. Player movement and relevant interactions are synchronized through the WebSocket server.

## Project Structure

```text id="s7q4kc"
Virtual-Campus/
│
├── assets/                 # Images, sprites, and other application assets
├── public/                 # Frontend files
├── server.js               # Application and WebSocket server
├── package.json            # Project configuration and dependencies
├── package-lock.json       # Dependency lock file
└── README.md               # Project documentation
```

## Future Enhancements

Potential future improvements include:

* User authentication and authorization
* Voice and video communication
* Virtual classrooms
* Private collaboration rooms
* Multiple campus environments
* Enhanced user profiles and avatars
* Improved mobile device compatibility

## Contributing

Contributions to this project are welcome. Users may contribute by reporting issues, suggesting improvements, or submitting pull requests.

## License

This project is available for educational and development purposes. Please refer to the repository for specific licensing information.

## Author

Developed as a Virtual Campus project for creating interactive and collaborative digital environments.
