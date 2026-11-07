package router

import (
	"html/template"
	"io/fs"
	"strings"
	"testing"

	"github.com/v03413/bepusdt/static"
)

func TestAdditionalCheckoutTemplatesAreEmbedded(t *testing.T) {
	cases := []struct {
		dir  string
		name string
	}{
		{"neon", "Neon"},
		{"minimal", "Minimal"},
		{"sunset", "Sunset"},
		{"azure", "Azure"},
		{"onyx", "Onyx"},
		{"coral", "Coral"},
		{"sage", "Sage"},
		{"mono", "Mono"},
	}

	for _, tc := range cases {
		t.Run(tc.dir, func(t *testing.T) {
			base := "checkout/" + tc.dir
			checkout, err := readCheckoutInfoFromFS(static.Checkout, base)
			if err != nil {
				t.Fatalf("read checkout info: %v", err)
			}
			if checkout.Name != tc.name {
				t.Fatalf("unexpected checkout name: %q", checkout.Name)
			}
			if checkout.Author == "" || checkout.Desc == "" {
				t.Fatal("checkout author and desc are required")
			}

			view, err := fs.ReadFile(static.Checkout, base+"/views/checkout.html")
			if err != nil {
				t.Fatalf("read checkout template: %v", err)
			}
			content := string(view)
			if !strings.Contains(content, "/checkout/"+tc.dir+"/assets/") {
				t.Fatalf("%s must reference its own assets", tc.dir)
			}
			if strings.Contains(content, "/checkout/official/") {
				t.Fatalf("%s must not reference official assets", tc.dir)
			}
			if strings.Contains(content, "github.com") || strings.Contains(content, "Powered by") {
				t.Fatalf("%s must not keep external footer attribution", tc.dir)
			}

			tmpl := template.New("default")
			if !registerTemplatesFromFS(tmpl, static.Checkout, base, tc.dir) {
				t.Fatalf("%s checkout template was not registered", tc.dir)
			}
			if tmpl.Lookup(tc.dir+"/checkout.html") == nil {
				t.Fatalf("%s checkout template was not registered under expected name", tc.dir)
			}
		})
	}
}
