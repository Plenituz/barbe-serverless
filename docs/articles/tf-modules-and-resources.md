# Using raw Terraform resources, data and modules

- You can use any Terraform resource, data or module just like you would in a regular Terraform project.
- Raw Terraform resources, data or modules do not take advantage of the `default` and `global_default` blocks
- You can even define Terraform modules using Barbe-serverless configurations, running `barbe generate` will keep the folder structure of your project intact in the output directory.
- You can mix them into your Barbe-serverless file, or keep them in a separate file. 
- However, If you make a reference to any Barbe-serverless construct make sure they go through Barbe when running `barbe generate`. For example: `barbe generate *.hcl *.tf` 


