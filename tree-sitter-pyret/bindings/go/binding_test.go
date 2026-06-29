package tree_sitter_pyret_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-pyret"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_pyret.Language())
	if language == nil {
		t.Errorf("Error loading Pyret grammar")
	}
}
