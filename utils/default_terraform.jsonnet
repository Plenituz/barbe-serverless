local barbe = std.extVar("barbe");

barbe.pipelines([{
    apply: [
        function(container) barbe.databags([
            {
                Type: "terraform_execute",
                Name: "default_apply",
                Value: {
                    display_name: "Terraform apply - root directory",
                    mode: "apply",
                    dir: std.extVar("barbe_output_dir"),
                }
            }
        ]),
        function(container) barbe.databags([
            {
                Name: "terraform_default_apply",
                Type: "barbe_import_component",
                Value: {
                    url: "https://hub.maplecone.com/barbe-serverless/terraform_execute/v0.0.3/.jsonnet"
                }
            }
        ]),
    ],
    destroy: [
        function(container) barbe.databags([
            {
                Type: "terraform_execute",
                Name: "default_destroy",
                Value: {
                    display_name: "Terraform destroy - root directory",
                    message: "Destroying Terraform plan, stopping the process now can lead to orphan resources",
                    mode: "destroy",
                    dir: std.extVar("barbe_output_dir"),
                }
            }
        ]),
        function(container) barbe.databags([
            {
                Name: "terraform_default_destroy",
                Type: "barbe_import_component",
                Value: {
                    url: "https://hub.maplecone.com/barbe-serverless/terraform_execute/v0.0.3/.jsonnet"
                }
            }
        ]),

    ]
}])