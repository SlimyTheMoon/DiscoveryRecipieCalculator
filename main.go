package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// --- Data Structures ---

type ConsumedItem struct {
	Item     string `json:"item"`
	Quantity int    `json:"quantity"`
}

type ConsumedDynamicAlt struct {
	Quantity     int      `json:"quantity"`
	Alternatives []string `json:"alternatives"`
}

type AffiliationBonus struct {
	Faction string  `json:"faction"`
	Bonus   float64 `json:"bonus"`
}

type Recipe struct {
	Nickname       string               `json:"nickname"`
	ProducedItems  []ConsumedItem       `json:"producedItems"`
	Infotext       string               `json:"infotext"`
	ShortcutNumber int                  `json:"shortcutNumber,omitempty"`
	CraftType      string               `json:"craftType,omitempty"`
	BuildType      string               `json:"buildType,omitempty"`
	CookingRate    int                  `json:"cookingRate"`
	ReqLevel       int                  `json:"reqLevel"`
	Consumed       []ConsumedItem       `json:"consumed"`
	ConsumedAlt    []ConsumedDynamicAlt `json:"consumedAlt,omitempty"`
	Catalysts      []ConsumedItem       `json:"catalysts,omitempty"`
	Affiliations   []AffiliationBonus   `json:"affiliations,omitempty"`
	CreditCost     int                  `json:"creditCost,omitempty"`
	CargoStorage   int                  `json:"cargoStorage,omitempty"`
	CraftLists     []string             `json:"craftLists,omitempty"`
	LoopProduction int                  `json:"loopProduction,omitempty"`
	Restricted     bool                 `json:"restricted,omitempty"`
	ModuleClass    int                  `json:"moduleClass,omitempty"`
	RecipeNumber   int                  `json:"recipeNumber,omitempty"`
	Source         string               `json:"source"`
}

type SiteData struct {
	Recipes        []Recipe           `json:"recipes"`
	Factions       map[string]string  `json:"factions"`
	CraftTypes     []string           `json:"craftTypes"`
	BuildTypes     []string           `json:"buildTypes"`
	Volumes        map[string]float64 `json:"volumes"`
	CommodityNames map[string]string  `json:"commodityNames"`
}

// --- Parser ---

func parseCfgFile(path string, source string) ([]Recipe, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening %s: %w", path, err)
	}
	defer file.Close()

	var recipes []Recipe
	var current *Recipe

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Strip inline comments
		if idx := strings.Index(line, ";"); idx >= 0 {
			if idx == 0 {
				continue
			}
			line = strings.TrimSpace(line[:idx])
		}

		if line == "" {
			continue
		}

		if line == "[recipe]" {
			if current != nil {
				recipes = append(recipes, *current)
			}
			current = &Recipe{Source: source}
			continue
		}

		if current == nil {
			continue
		}

		eqIdx := strings.Index(line, "=")
		if eqIdx < 0 {
			continue
		}

		key := strings.TrimSpace(line[:eqIdx])
		value := strings.TrimSpace(line[eqIdx+1:])

		switch key {
		case "nickname":
			current.Nickname = value
		case "produced_item":
			parts := splitCSV(value)
			qty := 1
			if len(parts) > 1 {
				qty, _ = strconv.Atoi(parts[1])
			}
			current.ProducedItems = append(current.ProducedItems, ConsumedItem{
				Item:     parts[0],
				Quantity: qty,
			})
		case "infotext":
			current.Infotext = value
		case "shortcut_number":
			current.ShortcutNumber, _ = strconv.Atoi(value)
		case "craft_type":
			current.CraftType = value
		case "build_type":
			current.BuildType = value
		case "cooking_rate":
			current.CookingRate, _ = strconv.Atoi(value)
		case "reqlevel":
			current.ReqLevel, _ = strconv.Atoi(value)
		case "credit_cost":
			current.CreditCost, _ = strconv.Atoi(value)
		case "cargo_storage":
			current.CargoStorage, _ = strconv.Atoi(value)
		case "module_class":
			current.ModuleClass, _ = strconv.Atoi(value)
		case "recipe_number":
			current.RecipeNumber, _ = strconv.Atoi(value)
		case "loop_production":
			current.LoopProduction, _ = strconv.Atoi(value)
		case "restricted":
			current.Restricted = value == "true"
		case "consumed":
			parts := splitCSV(value)
			if len(parts) >= 2 {
				qty, _ := strconv.Atoi(parts[1])
				current.Consumed = append(current.Consumed, ConsumedItem{
					Item:     parts[0],
					Quantity: qty,
				})
			}
		case "consumed_dynamic_alt":
			parts := splitCSV(value)
			if len(parts) >= 3 {
				qty, _ := strconv.Atoi(parts[0])
				alts := make([]string, 0, len(parts)-1)
				for _, p := range parts[1:] {
					alts = append(alts, p)
				}
				current.ConsumedAlt = append(current.ConsumedAlt, ConsumedDynamicAlt{
					Quantity:     qty,
					Alternatives: alts,
				})
			}
		case "catalyst":
			parts := splitCSV(value)
			if len(parts) >= 2 {
				qty, _ := strconv.Atoi(parts[1])
				current.Catalysts = append(current.Catalysts, ConsumedItem{
					Item:     parts[0],
					Quantity: qty,
				})
			}
		case "affiliation_bonus":
			parts := splitCSV(value)
			if len(parts) >= 2 {
				bonus, _ := strconv.ParseFloat(parts[1], 64)
				current.Affiliations = append(current.Affiliations, AffiliationBonus{
					Faction: parts[0],
					Bonus:   bonus,
				})
			}
		case "craft_list":
			current.CraftLists = append(current.CraftLists, value)
		}
	}

	if current != nil {
		recipes = append(recipes, *current)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scanning %s: %w", path, err)
	}

	return recipes, nil
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}

func loadFactions(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading factions: %w", err)
	}
	var factions map[string]string
	if err := json.Unmarshal(data, &factions); err != nil {
		return nil, fmt.Errorf("parsing factions: %w", err)
	}
	return factions, nil
}

func parseCommodities(path string) (map[string]float64, map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("opening %s: %w", path, err)
	}
	defer file.Close()

	volumes := make(map[string]float64)
	names := make(map[string]string)
	var nickname string
	inCommodity := false

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "[") {
			inCommodity = strings.EqualFold(line, "[Commodity]")
			nickname = ""
			continue
		}
		if !inCommodity {
			continue
		}
		// Comment line = display name
		if strings.HasPrefix(line, ";") {
			if nickname != "" {
				names[nickname] = strings.TrimSpace(line[1:])
			}
			continue
		}
		eqIdx := strings.Index(line, "=")
		if eqIdx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:eqIdx])
		value := strings.TrimSpace(line[eqIdx+1:])
		// Strip inline comments
		if idx := strings.Index(value, ";"); idx >= 0 {
			value = strings.TrimSpace(value[:idx])
		}
		switch key {
		case "nickname":
			nickname = value
		case "volume":
			if nickname != "" {
				v, _ := strconv.ParseFloat(value, 64)
				volumes[nickname] = v
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, nil, fmt.Errorf("scanning %s: %w", path, err)
	}
	return volumes, names, nil
}

func collectUniqueStrings(recipes []Recipe, getter func(Recipe) string) []string {
	seen := make(map[string]bool)
	var result []string
	for _, r := range recipes {
		v := getter(r)
		if v != "" && !seen[v] {
			seen[v] = true
			result = append(result, v)
		}
	}
	return result
}

// --- Site Builder ---

func buildSite(sourcesDir, outputDir string) error {
	itemsPath := filepath.Join(sourcesDir, "base_recipe_items.cfg")
	modulesPath := filepath.Join(sourcesDir, "base_recipe_modules.cfg")
	factionsPath := filepath.Join(sourcesDir, "factions.json")

	itemRecipes, err := parseCfgFile(itemsPath, "items")
	if err != nil {
		return err
	}

	moduleRecipes, err := parseCfgFile(modulesPath, "modules")
	if err != nil {
		return err
	}

	factions, err := loadFactions(factionsPath)
	if err != nil {
		return err
	}

	volumesPath := filepath.Join(sourcesDir, "select_equip.ini")
	volumes, commodityNames, err := parseCommodities(volumesPath)
	if err != nil {
		return err
	}

	allRecipes := append(itemRecipes, moduleRecipes...)

	craftTypes := collectUniqueStrings(allRecipes, func(r Recipe) string { return r.CraftType })
	buildTypes := collectUniqueStrings(allRecipes, func(r Recipe) string { return r.BuildType })

	siteData := SiteData{
		Recipes:        allRecipes,
		Factions:       factions,
		CraftTypes:     craftTypes,
		BuildTypes:     buildTypes,
		Volumes:        volumes,
		CommodityNames: commodityNames,
	}

	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("creating output dir: %w", err)
	}

	// Write JSON data
	jsonData, err := json.Marshal(siteData)
	if err != nil {
		return fmt.Errorf("marshaling JSON: %w", err)
	}

	if err := os.WriteFile(filepath.Join(outputDir, "data.json"), jsonData, 0o644); err != nil {
		return fmt.Errorf("writing data.json: %w", err)
	}

	// Write HTML
	if err := os.WriteFile(filepath.Join(outputDir, "index.html"), []byte(indexHTML), 0o644); err != nil {
		return fmt.Errorf("writing index.html: %w", err)
	}

	// Write CSS
	if err := os.WriteFile(filepath.Join(outputDir, "style.css"), []byte(styleCSS), 0o644); err != nil {
		return fmt.Errorf("writing style.css: %w", err)
	}

	// Write JS
	if err := os.WriteFile(filepath.Join(outputDir, "app.js"), []byte(appJS), 0o644); err != nil {
		return fmt.Errorf("writing app.js: %w", err)
	}

	fmt.Printf("Site built: %d recipes (%d items, %d modules) → %s\n",
		len(allRecipes), len(itemRecipes), len(moduleRecipes), outputDir)

	return nil
}

// --- Dev Server ---

func serveSite(dir string, port int) error {
	fs := http.FileServer(http.Dir(dir))
	http.Handle("/", fs)
	addr := fmt.Sprintf(":%d", port)
	fmt.Printf("Serving %s at http://localhost%s\n", dir, addr)
	return http.ListenAndServe(addr, nil)
}

// --- Main ---

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage:")
		fmt.Println("  go run main.go build   - Build static site to docs/")
		fmt.Println("  go run main.go serve   - Build and serve locally on :8080")
		os.Exit(1)
	}

	sourcesDir := "sources"
	outputDir := "docs"

	switch os.Args[1] {
	case "build":
		if err := buildSite(sourcesDir, outputDir); err != nil {
			log.Fatal(err)
		}
	case "serve":
		if err := buildSite(sourcesDir, outputDir); err != nil {
			log.Fatal(err)
		}
		port := 8080
		if len(os.Args) > 2 {
			p, err := strconv.Atoi(os.Args[2])
			if err == nil {
				port = p
			}
		}
		if err := serveSite(outputDir, port); err != nil {
			log.Fatal(err)
		}
	default:
		fmt.Printf("Unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}
