# Discovery Recipe Calculator

A static site generator and crafting calculator for [Discovery Freelancer](https://discoverygc.com/). Parses game recipe configuration files and produces a filterable, searchable web interface for all crafting recipes.

## Features

- Parses `base_recipe_items.cfg` and `base_recipe_modules.cfg` from the `sources/` directory
- Generates a static site with all recipes as interactive, filterable cards
- Filter by **source** (Items / Modules), **category** (JumpDrive, Cloak, Factory, Refinery, etc.), and **free-text search**
- **Faction affiliation filter** — select a faction to highlight bonus recipes and see adjusted cooking times
- **Cooking time calculation** — `total consumed units ÷ cooking rate (units/min)` with formula breakdown
- Material proportion bar showing each ingredient's share of processing time
- Supports consumed items, dynamic alternatives (OR choices), and catalysts
- Dark themed, responsive UI

## Project Structure

```
├── main.go          # CLI entry point: parser, site builder, dev server
├── template.go      # Embedded HTML template
├── style.go         # Embedded CSS
├── appjs.go         # Embedded JavaScript (filtering, rendering, calculation)
├── go.mod           # Go module definition
├── Dockerfile       # Multi-stage Docker build
├── sources/         # Game data files
│   ├── base_recipe_items.cfg
│   ├── base_recipe_modules.cfg
│   └── factions.json
└── docs/            # Generated static site (GitHub Pages)
    ├── index.html
    ├── style.css
    ├── app.js
    └── data.json
```

## Prerequisites

- [Go](https://go.dev/) 1.21+ **or** [Docker](https://www.docker.com/)

## Usage

### Build the static site

```sh
go run . build
```

This parses the config files in `sources/` and generates the static site into `docs/`.

### Run the local development server

```sh
go run . serve
```

Builds the site and starts a local HTTP server at **http://localhost:8080**.

To use a custom port:

```sh
go run . serve 3000
```

### Docker

Build the image:

```sh
docker build -t discovery-recipe-calculator .
```

Run the container:

```sh
docker run -p 8080:8080 discovery-recipe-calculator
```

The calculator will be available at **http://localhost:8080**.

## GitHub Pages

The `docs/` folder contains the generated static site. To publish with GitHub Pages:

1. Push the repository to GitHub
2. Go to **Settings → Pages**
3. Set source to **Deploy from a branch**
4. Select the `main` branch and `/docs` folder
5. Save

## Data Sources

Recipe data is read from the `sources/` directory:

| File | Contents |
|---|---|
| `base_recipe_items.cfg` | Equipment recipes (jump drives, cloaks, weapons, shields, etc.) |
| `base_recipe_modules.cfg` | Base module recipes (factories, refineries, defense, storage, etc.) |
| `factions.json` | Faction ID to display name mapping |

## Cooking Time Calculation

Cooking time is calculated as:

$$\text{Time (minutes)} = \frac{\text{Total consumed units}}{\text{Cooking rate (units/min)}}$$

When a faction affiliation bonus applies, consumed material quantities are reduced by the bonus factor before dividing by the cooking rate, resulting in a shorter cook time.
