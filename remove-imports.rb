require 'fileutils'

REACT_IMPORT_REGEX = /import React(?:,\s*(\{.*\})\s*|\s+)?from 'react';\n/m
REACT_REFERENCE_REGEX = /\bReact\b/

def remove_unused_react_import(file_path)
  content = File.read(file_path)

  if content.scan(REACT_REFERENCE_REGEX).length != 1
    return
  end

  match = content.match(REACT_IMPORT_REGEX)
  if match
    puts "Removing unused React import in #{file_path}"
    content.gsub!(REACT_IMPORT_REGEX, if match[1] then "import #{match[1]} from 'react';\n" else "" end)
    File.write(file_path, content)
  end
end

def process_files()
  Dir.glob("**/*.tsx").each do |file_path|
    remove_unused_react_import(file_path)
  end
end

process_files()
