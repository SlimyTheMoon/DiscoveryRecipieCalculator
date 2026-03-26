# Discovery Recipe Calculator

A static site generator and crafting calculator for [Discovery Freelancer](https://discoverygc.com/). Parses game recipe configuration files and produces a filterable, searchable web interface for all crafting recipes.

**[Live Version](https://slimythemoon.github.io/DiscoveryRecipieCalculator/)**

## Features

- Parses `base_recipe_items.cfg` and `base_recipe_modules.cfg` from the `sources/` directory
- Generates a static site with all recipes as interactive, filterable cards
- Filter by **source** (Items / Modules), **category**, and **free-text search**
- **Faction affiliation bonus** — searchable autocomplete to select a faction, see adjusted material quantities and cooking times
- **"Only with bonus" filter** — when a faction is selected, toggle to show only recipes that faction has a bonus on
- **Per Batch / 24 Hours toggle** — switch between per-batch and 24-hour production views (items only, not modules)
- **Profit calculator** — per-item buy/sell price inputs with real-time cost, revenue, and margin calculation; updates with batch/24h mode and affiliation bonuses
- **Cooking time calculation** — `total consumed volume ÷ cooking rate (vol/min)` with formula breakdown and material proportion bar
- **Real commodity names** — item names sourced from game data (`select_equip.ini`) instead of auto-generated from internal nicknames
- Supports consumed items, dynamic alternatives (OR choices), and catalysts
- Module recipes show produced items resolved from craft lists
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
│   ├── factions.json
│   └── select_equip.ini
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

The `docs/` folder contains the generated static site and is published at:

**https://slimythemoon.github.io/DiscoveryRecipieCalculator/**

To set up GitHub Pages on your own fork:

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
| `select_equip.ini` | Commodity definitions — volume per unit and display names |

## Cooking Time Calculation

Cooking time is calculated as:

$$\text{Time (seconds)} = \frac{\sum (\text{quantity} \times \text{volume per unit})}{\text{Cooking rate (vol/min)}} \times 60$$

Each consumed item's quantity is multiplied by its volume (from `select_equip.ini`) to get the total volume. When a faction affiliation bonus applies, consumed material quantities are reduced by the bonus factor before the calculation, resulting in a shorter cook time.
