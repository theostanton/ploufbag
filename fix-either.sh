#!/bin/bash

# Script to convert .success/.value/.error patterns to Either tuple pattern

cd /Users/theopersonal/Library/Mobile\ Documents/com~apple~CloudDocs/Code/parastats/functions/src

# Add isSuccess import where needed
find . -name "*.ts" -exec grep -l "\.success" {} \; | xargs grep -L "isSuccess" | while read file; do
    # Check if file already imports from @ploufbag/common
    if grep -q "from \"@ploufbag/common\"" "$file"; then
        # Add isSuccess to existing import
        sed -i '' 's/} from "@ploufbag\/common";/, isSuccess} from "@ploufbag\/common";/g' "$file"
    else
        # Add new import line
        sed -i '' '1i\
import {isSuccess} from "@ploufbag/common";
' "$file"
    fi
done

echo "Added isSuccess imports"

# Convert basic .success patterns
find . -name "*.ts" -exec sed -i '' 's/if (\([^)]*\)\.success)/if (isSuccess(\1))/g' {} \;
find . -name "*.ts" -exec sed -i '' 's/if (!\([^)]*\)\.success)/if (!isSuccess(\1))/g' {} \;

echo "Converted .success patterns"

# Convert .value patterns (this is more complex, needs manual review)
echo "Manual conversion needed for .value and .error patterns"