package main

import (
	"fmt"
	"maps"
	"os"
	"regexp"
	"slices"
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/votingworks/vxsuite/tools/vitestify/ast"
	"github.com/votingworks/vxsuite/tools/vitestify/parse"
	"github.com/votingworks/vxsuite/tools/vitestify/update"
)

var (
	regexJestReference = regexp.MustCompile(
		`\s(?m:^[^/*]*\b(?:` +
			strings.Join([]string{
				`jest\.\w+`,
				`test(:?\.each)?\(`,
				`it(:?\.each)?\(`,
				`(?:before|after)(?:Each|All)\(`,
				`expect(?:\.\w+)?\(`,
			}, "|") +
			`))`,
	)
	regexJestRequireActual = regexp.MustCompile(
		`\bjest\.requireActual(?:<.+>)?\(([^)]+)\)`,
	)
	regexOldDirnameReferences = regexp.MustCompile("(__dirname|__filename)")
	// testingLibraryMatches     = []string{
	// 	"toBeInTheDocument",
	// 	"toBeDisabled",
	// 	"toContainHTML",
	// 	"toHaveAttribute",
	// 	"toHaveStyle",
	// 	"toHaveStyleRule",
	// 	"toHaveTextContent",
	// }
)

const CHARS_PER_LINE_MAX = 80

const (
	TYPE_NAME_CUSTOM_MATCHER_RESULT = "CustomMatcherResult"
	TYPE_NAME_EXPECTATION_RESULT    = "ExpectationResult"
	TYPE_NAME_MOCK                  = "Mock"
	TYPE_NAME_MOCK_INSTANCE         = "MockInstance"
	TYPE_NAME_MOCKED                = "Mocked"
	TYPE_NAME_MOCKED_CLASS          = "MockedClass"
	TYPE_NAME_MOCKED_FUNCTION       = "MockedFunction"
	TYPE_NAME_SPY_INSTANCE          = "SpyInstance"
)

var (
	typeImports = []string{
		TYPE_NAME_CUSTOM_MATCHER_RESULT,
		TYPE_NAME_EXPECTATION_RESULT,
		TYPE_NAME_MOCK,
		TYPE_NAME_MOCK_INSTANCE,
		TYPE_NAME_MOCKED,
		TYPE_NAME_MOCKED_CLASS,
		TYPE_NAME_MOCKED_FUNCTION,
		TYPE_NAME_SPY_INSTANCE,
	}
)

const (
	FN_NAME_AFTER_ALL   = "afterAll"
	FN_NAME_AFTER_EACH  = "afterEach"
	FN_NAME_BEFORE_ALL  = "beforeAll"
	FN_NAME_BEFORE_EACH = "beforeEach"
	FN_NAME_DESCRIBE    = "describe"
	FN_NAME_EXPECT      = "expect"
	FN_NAME_IT          = "it"
	FN_NAME_TEST        = "test"
)

type vitestifyTask struct {
	edits []codeEdit
	// existingTestingLibraryDomImport *sitter.Node
	existingVitestImport   *sitter.Node
	existingNodePathImport *sitter.Node
	existingNodeUrlImport  *sitter.Node
	filename               string
	hasEsmDirnamePatch     bool
	hasEsmFilenamePatch    bool
	needsAsyncFns          map[*sitter.Node]interface{}
	needsEsmDirnamePatch   bool
	needsEsmFilenamePatch  bool
	// needsTestingLibraryDomImport bool
	src           *parse.Src
	vitestImports map[string]interface{}
}

type codeEdit struct {
	endByte     int
	replacement string
	startByte   int
}

func (self codeEdit) String() string {
	return fmt.Sprintf(
		"[%d - %d]: %s",
		self.startByte,
		self.endByte,
		self.replacement,
	)
}

func newVitestifyTask(filename string) *vitestifyTask {
	return &vitestifyTask{
		filename:      filename,
		needsAsyncFns: map[*sitter.Node]interface{}{},
		vitestImports: map[string]interface{}{},
	}
}

func (self *vitestifyTask) run() (string, error) {
	file := parse.NewFile(strings.TrimPrefix(self.filename, repoRoot+"/"))
	code, err := os.ReadFile(self.filename)
	if err != nil {
		return "", err
	}

	needsEsmUpdates := ENABLE_ESM_UPDATES && regexOldDirnameReferences.Match(code)
	if !regexJestReference.Match(code) && !needsEsmUpdates {
		return "", noop
	}

	self.src, err = parse.ParseSrc(file, code)
	if err != nil {
		return "", err
	}
	defer self.src.Dispose()

	err = self.walkNode(self.src.RootNode())
	if err != nil {
		return "", err
	}

	if len(self.vitestImports) == 0 && len(self.edits) == 0 &&
		!self.needsEsmDirnamePatch &&
		!self.needsEsmFilenamePatch {
		return "", noop
	}

	outputChunks := update.OutputChunkList{}
	if len(self.vitestImports) > 0 {
		namedImports := slices.SortedFunc(
			maps.Keys(self.vitestImports),
			func(a string, b string) int {
				return strings.Compare(
					strings.ToLower(strings.TrimPrefix(a, "type ")),
					strings.ToLower(strings.TrimPrefix(b, "type ")),
				)
			},
		)

		importStatement := fmt.Sprintf(
			`import { %s } from 'vitest';`,
			strings.Join(namedImports, ", "),
		)

		if len(importStatement) > CHARS_PER_LINE_MAX {
			importStatement = fmt.Sprint(
				`import {`,
				"\n",
				fmt.Sprintf(
					`  %s`,
					strings.Join(namedImports, ",\n  "),
				),
				"\n",
				`} from 'vitest';`)
		}

		outputChunks.Push(importStatement, "\n")
	}

	// if self.needsTestingLibraryDomImport {
	// 	outputChunks.Push(`import '@testing-library/jest-dom/vitest';`, "\n")
	// }

	if self.needsEsmDirnamePatch || self.needsEsmFilenamePatch {
		if self.existingNodeUrlImport != nil {
			self.edits = append(self.edits, codeEdit{
				startByte:   int(self.existingNodeUrlImport.StartByte()),
				endByte:     int(self.existingNodeUrlImport.EndByte()),
				replacement: "",
			})
		}
		outputChunks.Push(`import url from 'node:url';`, "\n")

		if self.needsEsmDirnamePatch && self.existingNodePathImport == nil {
			if self.existingNodePathImport != nil {
				self.edits = append(self.edits, codeEdit{
					startByte:   int(self.existingNodePathImport.StartByte()),
					endByte:     int(self.existingNodePathImport.EndByte()),
					replacement: "",
				})
			}
			outputChunks.Push(`import path from 'node:path';`, "\n")
		}

		outputChunks.Push(
			"\n",
			`const __filename = url.fileURLToPath(import.meta.url);`,
			"\n",
		)

		if self.needsEsmDirnamePatch {
			outputChunks.Push(`const __dirname = path.dirname(__filename);`, "\n")
		}

		outputChunks.Push("\n")
	}

	for fnNode := range self.needsAsyncFns {
		self.edits = append(self.edits, codeEdit{
			startByte:   int(fnNode.StartByte()),
			endByte:     int(fnNode.StartByte()),
			replacement: "async ",
		})

		returnTypeAnnotation := fnNode.ChildByFieldName("return_type")
		if returnTypeAnnotation != nil {
			returnTypeNode := returnTypeAnnotation.NamedChild(0)
			returnType := returnTypeNode.Content(self.src.Code())

			self.edits = append(self.edits, codeEdit{
				startByte:   int(returnTypeNode.StartByte()),
				endByte:     int(returnTypeNode.EndByte()),
				replacement: fmt.Sprintf("Promise<%s>", returnType),
			})
		}
	}

	slices.SortFunc(self.edits, func(a codeEdit, b codeEdit) int {
		return a.startByte - b.startByte
	})

	reader := self.src.NewReader()
	for _, edit := range self.edits {
		unchangedChunk, err := reader.ReadTo(int(edit.startByte))
		if err != nil {
			return "", fmt.Errorf("unable to read file chunk: %w", err)
		}

		outputChunks.Push(unchangedChunk)
		outputChunks.Push(edit.replacement)

		err = reader.Seek(int(edit.endByte))
		if err != nil {
			return "", fmt.Errorf("unexpected src seek error: %w", err)
		}
	}

	finalChunk, err := reader.ReadToEnd()
	if err != nil {
		return "", fmt.Errorf("unable to read file chunk: %w", err)
	}

	outputChunks.Push(finalChunk)

	return fmt.Sprint(outputChunks...), nil

}

func (self *vitestifyTask) walkNode(root *sitter.Node) error {
	for i := 0; i < int(root.NamedChildCount()); i += 1 {
		node := root.NamedChild(i)

		switch node.Type() {
		case ast.NODE_IMPORT_STATEMENT:
			sourceNode := node.ChildByFieldName(ast.FIELD_IMPORT_EXPORT_SOURCE)
			if sourceNode == nil {
				return fmt.Errorf(
					"🚨 unhandled/unexpected import statement format: %s [ %s ]",
					self.src.File().RootPath(),
					node.Content(self.src.Code()),
				)
			}

			switch sourceNode.Content(self.src.Code()) {
			case "'vitest'":
				if self.existingVitestImport != nil {
					continue
				}

				importClauseNode := node.NamedChild(0)
				if importClauseNode.Type() != ast.NODE_IMPORT_CLAUSE {
					return fmt.Errorf(
						"missing vitest import clause: %s",
						node.Content(self.src.Code()),
					)
				}

				for idxSubClause := range int(importClauseNode.NamedChildCount()) {
					namedImportsClause := importClauseNode.NamedChild(idxSubClause)
					if namedImportsClause.Type() != ast.NODE_NAMED_IMPORTS {
						continue
					}

					for idxName := range int(namedImportsClause.NamedChildCount()) {
						importSpecifierNode := namedImportsClause.NamedChild(idxName)
						if importSpecifierNode.Type() != ast.NODE_IMPORT_SPECIFIER {
							continue
						}

						nameNode := importSpecifierNode.ChildByFieldName(ast.FIELD_NAME)
						vitestImport := nameNode.Content(self.src.Code())
						if slices.Contains(typeImports, vitestImport) {
							vitestImport = "type " + vitestImport
						}
						self.vitestImports[vitestImport] = nil
					}
				}

				self.existingVitestImport = node
				self.edits = append(
					self.edits,
					codeEdit{
						startByte:   int(node.StartByte()),
						endByte:     int(node.EndByte()) + 1, // +newline
						replacement: "",
					},
				)

			// case "'@testing-library/jest-dom'":
			// 	self.needsTestingLibraryDomImport = true
			// 	self.edits = append(
			// 		self.edits,
			// 		codeEdit{
			// 			startByte:   int(node.StartByte()),
			// 			endByte:     int(node.EndByte()) + 1, // +newline
			// 			replacement: "",
			// 		},
			// 	)

			// case "'@testing-library/jest-dom/vitest'":
			// 	self.existingTestingLibraryDomImport = node
			// 	self.needsTestingLibraryDomImport = false

			case "'node:path'":
				importClause := node.NamedChild(0)
				if importClause.Type() != ast.NODE_IMPORT_CLAUSE {
					return fmt.Errorf(
						"missing node:path import clause: %s",
						node.Content(self.src.Code()),
					)
				}

				namespaceClause := importClause.NamedChild(0)
				if namespaceClause.Type() == ast.NODE_NAMESPACE_IMPORT ||
					namespaceClause.Type() == ast.NODE_IDENTIFIER {
					self.existingNodePathImport = node
				}

			case "'node:url'":
				importClause := node.NamedChild(0)
				if importClause.Type() != ast.NODE_IMPORT_CLAUSE {
					return fmt.Errorf(
						"missing node:url import clause: %s",
						node.Content(self.src.Code()),
					)
				}

				namespaceClause := importClause.NamedChild(0)
				if namespaceClause.Type() == ast.NODE_NAMESPACE_IMPORT ||
					namespaceClause.Type() == ast.NODE_IDENTIFIER {
					self.existingNodeUrlImport = node
				}
			}

		case ast.NODE_CALL_EXPRESSION:
			if err := self.processCallExpression(node); err != nil {
				return err
			}

		case ast.NODE_IDENTIFIER:
			isVariableDeclaration := node.Parent().
				Type() ==
				ast.NODE_VARIABLE_DECLARATOR

			name := node.Content(self.src.Code())

			if name == "__dirname" && ENABLE_ESM_UPDATES {
				if isVariableDeclaration {
					self.hasEsmDirnamePatch = true
					self.needsEsmDirnamePatch = false
				} else if !self.hasEsmDirnamePatch {
					self.needsEsmDirnamePatch = true
				}
			}

			if name == "__filename" && ENABLE_ESM_UPDATES {
				if isVariableDeclaration {
					self.hasEsmFilenamePatch = true
					self.needsEsmFilenamePatch = false
				} else if !self.hasEsmFilenamePatch {
					self.needsEsmFilenamePatch = true
				}
			}

		case ast.NODE_NESTED_TYPE_IDENTIFIER:
			if !strings.Contains(node.Content(self.src.Code()), "jest") {
				continue
			}

			if err := self.processJestType(node); err != nil {
				return err
			}

		default:
			if err := self.walkNode(node); err != nil {
				return err
			}
		}
	}

	return nil
}

func (self *vitestifyTask) processCallExpression(
	node *sitter.Node,
) error {
	nameNode := node.ChildByFieldName("function")

	var namespaceNode *sitter.Node
	var nameOrNamespace string
	var propertyNode *sitter.Node
	var propertyName string
	if nameNode.Type() == "member_expression" {
		propertyNode = nameNode.ChildByFieldName("property")
		propertyName = propertyNode.Content(self.src.Code())
		// if slices.Contains(testingLibraryMatches, propertyName) &&
		// 	self.existingTestingLibraryDomImport == nil {
		// 	self.needsTestingLibraryDomImport = true
		// }

		namespaceNode = nameNode.ChildByFieldName("object")
		nameOrNamespace = namespaceNode.Content(self.src.Code())
	} else {
		nameOrNamespace = nameNode.Content(self.src.Code())
	}

	switch nameOrNamespace {
	case "vi":
		self.vitestImports["vi"] = nil
		return nil

	case "jest":
		self.vitestImports["vi"] = nil
		return self.processJestFnCall(node, nameNode, namespaceNode)

	case "userEvent":
		if ENABLE_TESTING_LIBRARY_UPDATES {
			switch node.Parent().Type() {

			case ast.NODE_ARROW_FUNCTION:
				reactActEnclosure := findReactActEnclosure(node.Parent())

				if reactActEnclosure != nil &&
					reactActEnclosure.Type() == ast.NODE_EXPRESSION_STATEMENT {
					enclosingFn := findFunctionEnclosure(node)

					if enclosingFn == nil {
						return fmt.Errorf(
							"unable to find enclosing fn for non-awaited `userEvent`: %s:%d:%d",
							self.src.File().RootPath(),
							node.StartPoint().Row+1,
							node.StartPoint().Column+1,
						)
					}

					self.edits = append(self.edits, codeEdit{
						startByte:   int(reactActEnclosure.StartByte()),
						endByte:     int(reactActEnclosure.StartByte()),
						replacement: "await ",
					})

					if enclosingFn.Child(0).Type() != "async" {
						self.needsAsyncFns[enclosingFn] = nil
					}
				}

			case ast.NODE_EXPRESSION_STATEMENT:
				enclosingFn := findFunctionEnclosure(node)
				if enclosingFn == nil {
					return fmt.Errorf(
						"unable to find enclosing fn for non-awaited `userEvent`: %s:%d:%d",
						self.src.File().RootPath(),
						node.StartPoint().Row+1,
						node.StartPoint().Column+1,
					)
				}

				self.edits = append(self.edits, codeEdit{
					startByte:   int(node.StartByte()),
					endByte:     int(node.StartByte()),
					replacement: "await ",
				})
				if enclosingFn.Child(0).Type() != "async" {
					self.needsAsyncFns[enclosingFn] = nil
				}
			}
		}

	case "advanceTimersAndPromises":
		self.vitestImports["vi"] = nil
		self.edits = append(self.edits, codeEdit{
			startByte:   int(nameNode.StartByte()),
			endByte:     int(nameNode.EndByte()),
			replacement: "vi.advanceTimersByTimeAsync",
		})

		args := node.ChildByFieldName(ast.FIELD_FN_ARGUMENTS)
		argsReplacement := `(1000)`
		if args.NamedChildCount() > 0 {
			argsReplacement = fmt.Sprintf(
				`(%s * 1000)`,
				args.NamedChild(0).Content(self.src.Code()),
			)
		}

		self.edits = append(self.edits, codeEdit{
			startByte:   int(args.StartByte()),
			endByte:     int(args.EndByte()),
			replacement: argsReplacement,
		})

	case "advanceTimers":
		self.vitestImports["vi"] = nil
		self.edits = append(self.edits, codeEdit{
			startByte:   int(nameNode.StartByte()),
			endByte:     int(nameNode.EndByte()),
			replacement: "vi.advanceTimersByTime",
		})

		argsReplacement := node.ChildByFieldName(ast.FIELD_FN_ARGUMENTS)
		replacement := `(1000)`
		if argsReplacement.NamedChildCount() > 0 {
			replacement = fmt.Sprintf(
				`(%s * 1000)`,
				argsReplacement.NamedChild(0).Content(self.src.Code()),
			)
		}

		self.edits = append(self.edits, codeEdit{
			startByte:   int(argsReplacement.StartByte()),
			endByte:     int(argsReplacement.EndByte()),
			replacement: replacement,
		})

	case FN_NAME_AFTER_ALL:
		self.vitestImports[FN_NAME_AFTER_ALL] = nil
	case FN_NAME_AFTER_EACH:
		self.vitestImports[FN_NAME_AFTER_EACH] = nil
	case FN_NAME_BEFORE_ALL:
		self.vitestImports[FN_NAME_BEFORE_ALL] = nil
	case FN_NAME_BEFORE_EACH:
		self.vitestImports[FN_NAME_BEFORE_EACH] = nil
	case FN_NAME_DESCRIBE:
		self.vitestImports[FN_NAME_DESCRIBE] = nil
	case FN_NAME_EXPECT:
		self.vitestImports[FN_NAME_EXPECT] = nil
	case FN_NAME_IT:
		// Avoid name collisions with `it` iterator variables.
		// Only works because we don't have any `it.(each|only|skip|etc)` instances
		// in the codebase.
		if namespaceNode == nil {
			self.vitestImports[FN_NAME_IT] = nil
		}
	case FN_NAME_TEST:
		self.vitestImports[FN_NAME_TEST] = nil
	}

	switch propertyName {
	case "mockImplementation":
		args := node.ChildByFieldName(ast.FIELD_FN_ARGUMENTS)
		if args.NamedChildCount() == 0 {
			self.edits = append(self.edits, codeEdit{
				startByte:   int(args.StartByte()),
				endByte:     int(args.EndByte()),
				replacement: `(() => {})`,
			})
		}

		// case "toHaveStyleRule":
		// 	self.edits = append(self.edits, codeEdit{
		// 		startByte:   int(propertyNode.StartByte()),
		// 		endByte:     int(propertyNode.EndByte()),
		// 		replacement: "not.toHaveStyleRule",
		// 	})

		// case "toHaveStyle":
		// 	self.edits = append(self.edits, codeEdit{
		// 		startByte:   int(propertyNode.StartByte()),
		// 		endByte:     int(propertyNode.EndByte()),
		// 		replacement: "not.toHaveStyle",
		// 	})
	}

	return self.walkNode(node)
}

func (self *vitestifyTask) processJestFnCall(
	node *sitter.Node,
	nameNode *sitter.Node,
	namespaceNode *sitter.Node,
) error {
	propertyNode := nameNode.ChildByFieldName("property")
	propertyName := propertyNode.Content(self.src.Code())

	switch propertyName {
	case "mock":
		return self.processJestMock(node)

	case "requireActual":
		argsNode := node.ChildByFieldName("arguments")
		if argsNode == nil {
			return fmt.Errorf(
				"missing arguments for jest.setTimeout call: %s",
				node.Content(self.src.Code()),
			)
		}

		importPath := argsNode.NamedChild(0).Content(self.src.Code())
		self.edits = append(self.edits, codeEdit{
			startByte: int(node.StartByte()),
			endByte:   int(node.EndByte()),
			replacement: fmt.Sprintf(
				`(await vi.importActual<typeof import(%s)>(%s))`,
				importPath,
				importPath,
			),
		})

	case "setTimeout":
		argsNode := node.ChildByFieldName("arguments")
		if argsNode == nil {
			return fmt.Errorf(
				"missing arguments for jest.setTimeout call: %s",
				node.Content(self.src.Code()),
			)
		}

		timeoutValue := argsNode.NamedChild(0).Content(self.src.Code())
		self.edits = append(self.edits, codeEdit{
			startByte: int(node.StartByte()),
			endByte:   int(node.EndByte()),
			replacement: fmt.Sprintf(
				`vi.setConfig({ testTimeout: %s })`,
				timeoutValue,
			),
		})

	default:
		self.edits = append(self.edits, codeEdit{
			startByte:   int(namespaceNode.StartByte()),
			endByte:     int(namespaceNode.EndByte()),
			replacement: "vi",
		})
	}

	return nil
}

func (self *vitestifyTask) processJestMock(node *sitter.Node) error {
	argsNode := node.ChildByFieldName("arguments")
	importPath := argsNode.NamedChild(0).Content(self.src.Code())

	if argsNode.NamedChildCount() == 1 {
		self.edits = append(self.edits, codeEdit{
			startByte:   int(node.StartByte()),
			endByte:     int(node.EndByte()),
			replacement: fmt.Sprintf("vi.mock(%s)", importPath),
		})

		return nil
	}

	factoryNode := argsNode.NamedChild(1)
	factoryBody := factoryNode.ChildByFieldName("body").Content(self.src.Code())
	updatedBody := regexJestRequireActual.ReplaceAllString(
		factoryBody,
		fmt.Sprintf(`(await importActual<typeof import(%s)>())`, importPath),
	)
	updatedBody = strings.ReplaceAll(updatedBody, "jest.", "vi.")

	self.edits = append(self.edits, codeEdit{
		startByte: int(node.StartByte()),
		endByte:   int(node.EndByte()),
		replacement: fmt.Sprintf(
			"vi.mock(%s, async (importActual): Promise<typeof import(%s)> => %s)",
			importPath,
			importPath,
			updatedBody,
		),
	})

	return nil
}

func (self *vitestifyTask) processJestType(node *sitter.Node) error {
	nameNode := node.ChildByFieldName("name")
	if nameNode == nil {
		return fmt.Errorf(
			"missing name from jest type node: %s",
			node.Content(self.src.Code()),
		)
	}

	name := nameNode.Content(self.src.Code())
	switch name {
	case TYPE_NAME_CUSTOM_MATCHER_RESULT:
		self.edits = append(self.edits, codeEdit{
			startByte:   int(node.StartByte()),
			endByte:     int(node.EndByte()),
			replacement: `{ message: () => string; pass: boolean }`,
		})

	case TYPE_NAME_MOCK:
		self.vitestImports["type "+TYPE_NAME_MOCK] = nil
		self.edits = append(self.edits, codeEdit{
			startByte:   int(node.StartByte()),
			endByte:     int(node.EndByte()),
			replacement: TYPE_NAME_MOCK,
		})

	case TYPE_NAME_MOCKED:
		self.vitestImports["type "+TYPE_NAME_MOCKED] = nil
		self.edits = append(self.edits, codeEdit{
			startByte:   int(node.StartByte()),
			endByte:     int(node.EndByte()),
			replacement: TYPE_NAME_MOCKED,
		})

	case TYPE_NAME_MOCKED_CLASS:
		self.vitestImports["type "+TYPE_NAME_MOCKED_CLASS] = nil
		self.edits = append(self.edits, codeEdit{
			startByte:   int(node.StartByte()),
			endByte:     int(node.EndByte()),
			replacement: TYPE_NAME_MOCKED_CLASS,
		})

	case TYPE_NAME_MOCKED_FUNCTION:
		self.vitestImports["type "+TYPE_NAME_MOCKED_FUNCTION] = nil
		self.edits = append(self.edits, codeEdit{
			startByte:   int(node.StartByte()),
			endByte:     int(node.EndByte()),
			replacement: TYPE_NAME_MOCKED_FUNCTION,
		})

	case TYPE_NAME_SPY_INSTANCE:
		self.vitestImports["type "+TYPE_NAME_MOCK_INSTANCE] = nil
		self.edits = append(self.edits, codeEdit{
			startByte:   int(node.StartByte()),
			endByte:     int(node.EndByte()),
			replacement: TYPE_NAME_MOCK_INSTANCE,
		})

	default:
		return fmt.Errorf("unhandled jest type: jest.%s", name)
	}

	return nil
}

func findFunctionEnclosure(node *sitter.Node) *sitter.Node {
	maxDepth := 10
	current := node
	for i := 0; i < maxDepth; i += 1 {
		current = current.Parent()
		if current == nil {
			return nil
		}

		if current.Type() == ast.NODE_ARROW_FUNCTION ||
			current.Type() == ast.NODE_FUNCTION_DECLARATION {
			return current
		}
	}

	return nil
}

func findReactActEnclosure(fnNode *sitter.Node) *sitter.Node {
	parentFnArguments := fnNode.Parent()
	if parentFnArguments.Type() != ast.FIELD_FN_ARGUMENTS {
		return nil
	}

	callExpression := parentFnArguments.Parent()
	if callExpression.Type() != ast.NODE_CALL_EXPRESSION {
		return nil
	}

	enclosingStatement := callExpression.Parent()
	if enclosingStatement.Type() != ast.NODE_EXPRESSION_STATEMENT &&
		enclosingStatement.Type() != ast.NODE_AWAIT_EXPRESSION {
		return nil
	}

	return enclosingStatement
}
