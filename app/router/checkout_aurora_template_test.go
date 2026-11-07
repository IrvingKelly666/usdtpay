package router

import (
	"html/template"
	"io/fs"
	"strings"
	"testing"

	"github.com/v03413/bepusdt/static"
)

func TestAuroraCheckoutTemplateIsEmbedded(t *testing.T) {
	checkout, err := readCheckoutInfoFromFS(static.Checkout, "checkout/aurora")
	if err != nil {
		t.Fatalf("read aurora checkout info: %v", err)
	}

	if checkout.Name != "Aurora" {
		t.Fatalf("unexpected checkout name: %q", checkout.Name)
	}
	if checkout.Author == "" {
		t.Fatal("checkout author is required")
	}
	if checkout.Desc == "" {
		t.Fatal("checkout desc is required")
	}

	view, err := fs.ReadFile(static.Checkout, "checkout/aurora/views/checkout.html")
	if err != nil {
		t.Fatalf("read aurora checkout template: %v", err)
	}
	if strings.Contains(string(view), "/checkout/official/") {
		t.Fatal("aurora checkout template must not reference official assets")
	}
	if !strings.Contains(string(view), "/checkout/aurora/assets/") {
		t.Fatal("aurora checkout template must reference its own assets")
	}

	tmpl := template.New("default")
	if !registerTemplatesFromFS(tmpl, static.Checkout, "checkout/aurora", "aurora") {
		t.Fatal("aurora checkout template was not registered")
	}
	if tmpl.Lookup("aurora/checkout.html") == nil {
		t.Fatal("aurora checkout template was not registered under expected name")
	}
}
