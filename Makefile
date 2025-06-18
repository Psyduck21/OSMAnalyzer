# Directories
SRC_DIR := src
INCLUDE_DIR := include
BUILD_DIR := build
NATIVE_DIR := $(BUILD_DIR)/native
WASM_DIR := public

# Files
SRC_FILES := $(wildcard $(SRC_DIR)/*.cpp)
NATIVE_OBJ_FILES := $(patsubst $(SRC_DIR)/%.cpp,$(NATIVE_DIR)/%.o,$(SRC_FILES))
NATIVE_EXEC := $(NATIVE_DIR)/main
WASM_EXEC := $(WASM_DIR)/graph.js
GEOJSON_FILE := data/dehradun.geojson

# Compiler settings
CXX := g++
EMCC := emcc
CXXFLAGS := -I$(INCLUDE_DIR) -std=c++17 -O2

# Default target
all: native

# Native build
native: $(NATIVE_EXEC)

$(NATIVE_DIR)/%.o: $(SRC_DIR)/%.cpp | $(NATIVE_DIR)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(NATIVE_EXEC): $(NATIVE_OBJ_FILES)
	$(CXX) $(CXXFLAGS) $^ -o $@

# WebAssembly build
wasm:
	$(EMCC) $(CXXFLAGS) $(SRC_FILES) -o $(WASM_DIR)/graph.js \
		-s WASM=1 \
		-s MODULARIZE=1 \
		-s EXPORT_ES6=1 \
		-s ALLOW_MEMORY_GROWTH=1 \
		-s FORCE_FILESYSTEM=0 \
		-s ENVIRONMENT=web \
		-s EXPORTED_FUNCTIONS="['_initgraph','_findKShortestRoutes','_criticalpoints','_free']" \
		-s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','lengthBytesUTF8','stringToUTF8','allocateUTF8','UTF8ToString',_free']" \
		--preload-file data/dehradun.geojson@/data/dehradun.geojson \
		-std=c++17 \
		-O3


# Create directories if they don't exist
$(NATIVE_DIR):
	mkdir -p $(NATIVE_DIR)

$(WASM_DIR):
	mkdir -p $(WASM_DIR)

# Clean
clean:
	rm -rf $(BUILD_DIR)
